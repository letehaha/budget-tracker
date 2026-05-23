import { ASSET_CLASS, type InvestmentImportExtractionResult } from '@bt/shared/types/investments';
import { recordId } from '@common/lib/zod/custom-types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { createController } from '@controllers/helpers/controller-factory';
import { CustomError, UnexpectedError } from '@js/errors';
import { logger } from '@js/utils';
import Portfolios from '@models/investments/portfolios.model';
import {
  detectInvestmentDuplicates,
  extractInvestmentTransactionsWithAI,
  normaliseCurrency,
  resolveSymbols,
} from '@services/import-export/investment-transactions-parser';
import { extractTextFromFile, validateFileBuffer } from '@services/import-export/statement-parser';
import { Big } from 'big.js';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

/**
 * AI-extract investment transactions from an uploaded file (CSV/PDF/TXT).
 *
 * The endpoint runs in three logical phases:
 *   1. File validate + text extract (reuses statement-parser helpers).
 *   2. AI extracts a flat list of transaction rows (universal — both crypto
 *      and stocks, each row carries its own assetClassHint).
 *   3. Server groups rows by symbol → holding rows, resolves each symbol to a
 *      Security candidate via the provider matching the row's class hint,
 *      normalises currency, and flags possible duplicates.
 *
 * Response shape is the hierarchical `InvestmentImportExtractionResult` the
 * review UI consumes.
 */
export const extractController = createController(
  z.object({
    body: z.object({
      fileBase64: z.string().min(1, 'File content is required'),
      defaultPortfolioId: recordId(),
    }),
  }),
  async ({ user, body }) => {
    try {
      return await extractHandler({ userId: user.id, ...body });
    } catch (err) {
      if (err instanceof CustomError) throw err;
      // Don't echo the raw error string to the client — provider 401s, DB
      // connection messages, and stack-trace fragments would leak through.
      // The full error is logged for server-side debugging.
      logger.error({ message: 'Investment txn import extract failed', error: err as Error });
      throw new UnexpectedError({
        message: 'Investment transactions import failed. Check server logs for details.',
      });
    }
  },
);

async function extractHandler({
  userId,
  fileBase64,
  defaultPortfolioId,
}: {
  userId: number;
  fileBase64: string;
  defaultPortfolioId: string;
}) {
  // Check portfolio ownership BEFORE burning AI tokens. Without this guard a
  // user could pass an arbitrary portfolio id and we'd happily run extraction
  // and resolution against it (and bill the AI call). The error becomes a 404
  // via NotFoundError, which the frontend's `isResourceMissingError` already
  // routes to its not-found state.
  await findOrThrowNotFound({
    query: Portfolios.findOne({ where: { id: defaultPortfolioId, userId } }),
    message: 'Portfolio not found.',
  });

  const rawBuffer = Buffer.from(fileBase64, 'base64');
  const validation = validateFileBuffer({ buffer: rawBuffer });
  if (!validation.valid || !validation.fileBuffer || !validation.fileType) {
    throw new UnexpectedError({
      message: validation.error?.message ?? 'Invalid file',
    });
  }

  const textResult = await extractTextFromFile({
    buffer: validation.fileBuffer,
    fileType: validation.fileType,
  });
  if (!textResult.success) {
    throw new UnexpectedError({
      message: textResult.error ?? 'Failed to extract text from file',
    });
  }

  const aiResult = await extractInvestmentTransactionsWithAI({
    userId,
    text: textResult.text!,
  });

  if (!aiResult.success) {
    throw new UnexpectedError({
      message: aiResult.error.message,
    });
  }

  // Group the flat AI output by symbol.
  type Row = (typeof aiResult.result.rows)[number];
  const bySymbol = new Map<string, Row[]>();
  for (const row of aiResult.result.rows) {
    const list = bySymbol.get(row.symbol);
    if (list) list.push(row);
    else bySymbol.set(row.symbol, [row]);
  }

  // For symbol resolution, pick the most-common assetClassHint per ticker.
  // If the AI hinted both within a single ticker, majority wins and crypto
  // breaks ties (matches the legacy crypto-first behaviour).
  const symbolsWithHints = Array.from(bySymbol.entries()).map(([symbol, rows]) => {
    let crypto = 0;
    let stocks = 0;
    for (const r of rows) {
      if (r.assetClassHint === 'crypto') crypto += 1;
      else stocks += 1;
    }
    return { symbol, assetClassHint: (stocks > crypto ? 'stocks' : 'crypto') as 'crypto' | 'stocks' };
  });

  const resolution = await resolveSymbols({
    userId,
    symbolsWithHints,
    defaultPortfolioId,
  });

  // Build hierarchical holdings. Currency is picked from the first row of
  // each group — if the AI returned mixed quote currencies within a single
  // symbol we keep the first one and let the user fix in the UI.
  const warnings: string[] = [...resolution.warnings];

  // Surface rows the AI parser silently dropped. Without this warning the
  // user would see N transactions in the review step having uploaded a file
  // that contained more — and assume the source had only N trades.
  if (aiResult.result.droppedRowCount > 0) {
    warnings.push(
      `AI emitted ${aiResult.result.droppedRowCount} row(s) we couldn't parse (bad date, side, or numbers) — they were skipped.`,
    );
  }
  const holdings: InvestmentImportExtractionResult['holdings'] = [];
  const rowsForDedup: Array<{
    tempId: string;
    portfolioId: string;
    securityId: string;
    date: string;
    side: 'buy' | 'sell';
    price: string;
    amount: string;
  }> = [];

  for (const [symbol, rows] of bySymbol) {
    const resolved = resolution.bySymbol.get(symbol);

    // Normalise once per row, then reuse — picking the first usable currency,
    // counting invalid rows, and surfacing them as warnings should not call
    // normaliseCurrency four times per row.
    const normalisedCurrencies = rows.map((r) => normaliseCurrency({ raw: r.currency }));
    let currencyCode = normalisedCurrencies.find((c) => c !== null) ?? null;
    const invalidCount = normalisedCurrencies.filter((c) => c === null).length;

    // For stocks the AI usually emits the native quote currency (USD, EUR, …)
    // already normalised. If every row's quote currency was unrecognised but
    // the resolved security has its own native currency, fall back to that —
    // saves the user from picking something the server already knows.
    //
    // NOT applied for crypto: crypto/crypto pairs come in with empty quote
    // currency on purpose and must stay null so the UI prompts the user to
    // fix the pair.
    if (
      !currencyCode &&
      resolved?.resolvedSecurity?.currencyCode &&
      resolved.resolvedSecurity.assetClass !== ASSET_CLASS.crypto
    ) {
      currencyCode = resolved.resolvedSecurity.currencyCode.toUpperCase();
    }

    if (invalidCount > 0) {
      warnings.push(`Symbol "${symbol}" had ${invalidCount} row(s) with unsupported quote currency.`);
    }

    const holdingTempId = uuidv4();
    const txns = rows.map((row) => {
      const tempId = uuidv4();
      const amount = new Big(row.quantity).times(new Big(row.price)).plus(new Big(row.fees)).toFixed(10);
      if (resolved?.resolvedSecurity?.securityId) {
        rowsForDedup.push({
          tempId,
          portfolioId: defaultPortfolioId,
          securityId: resolved.resolvedSecurity.securityId,
          date: row.date,
          side: row.side,
          price: row.price,
          amount,
        });
      }
      return {
        tempId,
        date: row.date,
        side: row.side,
        quantity: row.quantity,
        price: row.price,
        fees: row.fees,
        amount,
        possibleDuplicateOf: null as string | null,
      };
    });

    holdings.push({
      tempId: holdingTempId,
      parsedSymbol: symbol,
      parsedName: rows[0]?.name ?? null,
      resolvedSecurity: resolved?.resolvedSecurity ?? null,
      resolvedConfidence: resolved?.resolvedConfidence ?? 'unmapped',
      portfolioId: defaultPortfolioId,
      currencyCode,
      hasExistingHolding: resolved?.hasExistingHolding ?? false,
      transactions: txns,
    });
  }

  // Mark possible duplicates against existing transactions for already-resolved rows.
  if (rowsForDedup.length > 0) {
    try {
      const candidates = await detectInvestmentDuplicates({
        userId,
        rows: rowsForDedup,
      });
      const byTempId = new Map(candidates.map((c) => [c.tempId, c.existingTransactionId]));
      for (const holding of holdings) {
        for (const tx of holding.transactions) {
          const match = byTempId.get(tx.tempId);
          if (match) tx.possibleDuplicateOf = match;
        }
      }
    } catch (error) {
      // Dedup failure shouldn't tank the whole extract — log it AND surface a
      // warning so the user knows the duplicate badges aren't reliable for
      // this import (otherwise they'd assume "no badges = no duplicates").
      logger.error({
        message: 'Investment txn import dedup detection failed',
        error: error as Error,
      });
      warnings.push('Could not check for possible duplicates — review your existing transactions manually.');
    }
  }

  return {
    data: {
      holdings,
      warnings,
      fileType: validation.fileType,
      tokenCount: aiResult.result.tokenCount,
    } satisfies InvestmentImportExtractionResult,
  };
}
