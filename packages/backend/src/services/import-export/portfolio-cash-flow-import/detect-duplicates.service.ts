/**
 * Detect existing PortfolioTransfers that look like duplicates of the rows
 * the user is about to import. We do not auto-skip — the response just
 * annotates each candidate row with the IDs of any matching existing transfers
 * so the review UI can flag them and let the user decide.
 *
 * Match criteria (all must hold):
 *   - same portfolioId
 *   - same direction (deposit / withdrawal)
 *   - same currencyCode
 *   - date within ±2 days
 *   - amount within $1
 */
import type { CashFlowDirection, CashFlowDuplicateMatch, ExtractedCashFlowRow } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import PortfolioTransfers from '@models/investments/portfolio-transfers.model';
import Portfolios from '@models/investments/portfolios.model';
import { Big } from 'big.js';
import { Op } from 'sequelize';

const DATE_WINDOW_DAYS = 2;
const AMOUNT_TOLERANCE = 1; // dollars / units of source currency

interface DetectDuplicatesParams {
  userId: number;
  portfolioId: number;
  rows: ExtractedCashFlowRow[];
}

const directionOf = ({
  tr,
  portfolioId,
}: {
  tr: PortfolioTransfers;
  portfolioId: number;
}): CashFlowDirection | null => {
  if (tr.toPortfolioId === portfolioId && tr.fromPortfolioId !== portfolioId) return 'deposit';
  if (tr.fromPortfolioId === portfolioId && tr.toPortfolioId !== portfolioId) return 'withdrawal';
  return null;
};

const shiftDate = ({ iso, days }: { iso: string; days: number }): string => {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export async function detectCashFlowDuplicates({
  userId,
  portfolioId,
  rows,
}: DetectDuplicatesParams): Promise<CashFlowDuplicateMatch[]> {
  await findOrThrowNotFound({
    query: Portfolios.findOne({ where: { id: portfolioId, userId } }),
    message: t({ key: 'investments.portfolioNotFound' }),
  });

  if (rows.length === 0) return [];

  // Pull all transfers for this portfolio that fall within the broadest window
  // implied by the input rows. One round-trip; in-memory match per row.
  const allDates = rows.map((r) => r.date).filter(Boolean);
  if (allDates.length === 0) return [];

  const minDate = shiftDate({ iso: allDates.toSorted()[0]!, days: -DATE_WINDOW_DAYS });
  const maxDate = shiftDate({ iso: allDates.toSorted().at(-1)!, days: DATE_WINDOW_DAYS });

  const candidates = await PortfolioTransfers.findAll({
    where: {
      userId,
      [Op.or]: [{ fromPortfolioId: portfolioId }, { toPortfolioId: portfolioId }],
      date: { [Op.between]: [minDate, maxDate] },
    },
  });

  const matches: CashFlowDuplicateMatch[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]!;
    const rowDateMs = new Date(row.date).getTime();
    if (Number.isNaN(rowDateMs)) continue;
    const rowAmount = new Big(row.amount);

    for (const tr of candidates) {
      const dir = directionOf({ tr, portfolioId });
      if (dir !== row.direction) continue;
      if (tr.currencyCode !== row.currencyCode) continue;

      const trDateMs = new Date(tr.date).getTime();
      const dayDiff = Math.abs(trDateMs - rowDateMs) / (24 * 60 * 60 * 1000);
      if (dayDiff > DATE_WINDOW_DAYS) continue;

      const trAmount = new Big(tr.amount.toDecimalString(10));
      if (trAmount.minus(rowAmount).abs().gt(AMOUNT_TOLERANCE)) continue;

      matches.push({
        rowIndex,
        existingTransferId: tr.id,
        existingDate: tr.date,
        existingAmount: trAmount.toFixed(2),
        existingCurrencyCode: tr.currencyCode,
        existingDirection: dir,
      });
    }
  }

  return matches;
}
