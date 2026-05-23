import { ASSET_CLASS, type InvestmentImportExtractionResult } from '@bt/shared/types/investments';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { CustomError, UnexpectedError } from '@js/errors';
import { logger } from '@js/utils';
import {
  assertSupportedImportAssetClass,
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
 *   2. AI extracts a flat list of transaction rows.
 *   3. Server groups rows by symbol → holding rows, resolves each symbol to a
 *      Security candidate, normalises currency, and flags possible duplicates.
 *
 * Response shape is the hierarchical `InvestmentImportExtractionResult` the
 * review UI consumes.
 */
export const extractController = createController(
  z.object({
    body: z.object({
      fileBase64: z.string().min(1, 'File content is required'),
      assetClass: z.enum([ASSET_CLASS.crypto, ASSET_CLASS.stocks]),
      defaultPortfolioId: recordId(),
    }),
  }),
  async ({ user, body }) => {
    try {
      return await extractHandler({ userId: user.id, ...body });
    } catch (err) {
      if (err instanceof CustomError) throw err;
      // Catch-all so debugging doesn't require reading server logs — the generic
      // UnexpectedError below would otherwise swallow the cause string.
      logger.error({ message: 'Investment txn import extract failed', error: err as Error });
      throw new UnexpectedError({
        message: `Investment transactions import failed: ${(err as Error).message}`,
      });
    }
  },
);

async function extractHandler({
  userId,
  fileBase64,
  assetClass,
  defaultPortfolioId,
}: {
  userId: number;
  fileBase64: string;
  assetClass: ASSET_CLASS;
  defaultPortfolioId: string;
}) {
  assertSupportedImportAssetClass({ assetClass });

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
    assetClass,
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

  const resolution = await resolveSymbols({
    userId,
    symbols: Array.from(bySymbol.keys()),
    assetClass,
    defaultPortfolioId,
  });

  // Build hierarchical holdings. Currency is picked from the first row of
  // each group — if the AI returned mixed quote currencies within a single
  // symbol we keep the first one and let the user fix in the UI.
  const warnings: string[] = [...resolution.warnings];
  const holdings: InvestmentImportExtractionResult['holdings'] = [];
  const rowsForDedup: Array<{
    tempId: string;
    portfolioId: string;
    securityId: string;
    date: string;
    side: 'buy' | 'sell';
    quantity: string;
  }> = [];

  for (const [symbol, rows] of bySymbol) {
    const resolved = resolution.bySymbol.get(symbol);

    // Normalise once per row, then reuse — picking the first usable currency,
    // counting invalid rows, and surfacing them as warnings should not call
    // normaliseCurrency four times per row.
    const normalisedCurrencies = rows.map((r) => normaliseCurrency({ raw: r.currency }));
    const currencyCode = normalisedCurrencies.find((c) => c !== null) ?? null;
    const invalidCount = normalisedCurrencies.filter((c) => c === null).length;

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
          quantity: row.quantity,
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
