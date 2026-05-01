/**
 * Atomically import N cash-flow rows into a portfolio.
 *
 * Each row becomes a PortfolioTransfer via `directCashTransaction`, with the
 * row-level `isHistorical` flag passed through. The whole operation runs
 * inside a single DB transaction (`withTransaction`) — if any row fails
 * validation (bad currency, non-existent portfolio, etc.) the whole import
 * rolls back rather than leaving the portfolio in a half-imported state.
 */
import type { CashFlowExecuteResponse, CashFlowExecuteRow } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import { logger } from '@js/utils/logger';
import Portfolios from '@models/investments/portfolios.model';
import { withTransaction } from '@services/common/with-transaction';
import { directCashTransaction } from '@services/investments/portfolios/transfers';

interface ExecuteImportParams {
  userId: number;
  portfolioId: number;
  rows: CashFlowExecuteRow[];
}

const executeCashFlowImportImpl = async ({
  userId,
  portfolioId,
  rows,
}: ExecuteImportParams): Promise<CashFlowExecuteResponse> => {
  if (rows.length === 0) {
    throw new ValidationError({ message: 'No rows to import.' });
  }

  await findOrThrowNotFound({
    query: Portfolios.findOne({ where: { id: portfolioId, userId } }),
    message: t({ key: 'investments.portfolioNotFound' }),
  });

  const newTransferIds: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    try {
      const transfer = await directCashTransaction({
        userId,
        portfolioId,
        type: row.direction,
        amount: row.amount,
        currencyCode: row.currencyCode,
        date: row.date,
        description: row.description ?? null,
        isHistorical: row.isHistorical,
      });

      newTransferIds.push(transfer.id);
    } catch (error) {
      // Log the original error so the underlying cause (DB constraint, etc.)
      // is preserved in server logs even though we re-throw a wrapped one.
      logger.error(error as Error);
      const original = error instanceof Error ? error.message : 'Unknown error';
      // Re-throw with row context. withTransaction will roll back the whole
      // batch — partial imports get confusing fast — and the caller sees
      // exactly which row blew up and why.
      throw new ValidationError({
        message: `Row ${i + 1} (${row.date}, ${row.currencyCode} ${row.amount}, ${row.direction}): ${original}`,
      });
    }
  }

  return {
    imported: newTransferIds.length,
    errors: [],
    newTransferIds,
  };
};

export const executeCashFlowImport = withTransaction(executeCashFlowImportImpl);
