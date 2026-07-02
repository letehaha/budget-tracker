import { toUtcDateString } from '@common/utils/date';
import InvestmentTransaction from '@models/investments/investment-transaction.model';
import PortfolioTransfers from '@models/investments/portfolio-transfers.model';
import Portfolios from '@models/investments/portfolios.model';
import VentureDeals from '@models/venture/venture-deals.model';
import { Op } from 'sequelize';

/**
 * Resolve the oldest event date the chart window should reach back to when the
 * caller did not supply `from`. Considers: the user's oldest enabled-portfolio
 * investment transaction, oldest venture deal, oldest enabled-portfolio
 * transfer. A portfolio funded only with cash (no trades, no venture deals)
 * still needs the range to reach back to its first transfer — otherwise that
 * cash never charts.
 */
export const resolveOldestEventDate = async ({
  userId,
  fallback,
}: {
  userId: number;
  fallback: string;
}): Promise<string> => {
  const enabledPortfolios = await Portfolios.findAll({
    where: { userId, isEnabled: true },
    attributes: ['id'],
    raw: true,
  });
  const enabledPortfolioIds = enabledPortfolios.map((p: { id: string }) => p.id);

  const [oldestTransaction, oldestDeal, oldestTransfer] = await Promise.all([
    InvestmentTransaction.findOne({
      where: { portfolioId: { [Op.in]: enabledPortfolioIds } },
      order: [['date', 'ASC']],
      attributes: ['date'],
      raw: true,
    }),
    VentureDeals.findOne({
      where: { userId },
      order: [['investmentDate', 'ASC']],
      attributes: ['investmentDate'],
      raw: true,
    }),
    PortfolioTransfers.findOne({
      where: {
        userId,
        [Op.or]: [
          { fromPortfolioId: { [Op.in]: enabledPortfolioIds } },
          { toPortfolioId: { [Op.in]: enabledPortfolioIds } },
        ],
      },
      order: [['date', 'ASC']],
      attributes: ['date'],
      raw: true,
    }),
  ]);

  const candidates: string[] = [];
  if (oldestTransaction?.date) candidates.push(toUtcDateString(oldestTransaction.date));
  if (oldestDeal?.investmentDate) candidates.push(oldestDeal.investmentDate);
  if (oldestTransfer?.date) candidates.push(oldestTransfer.date);

  // Fixed-width `yyyy-MM-dd` strings compare correctly lexicographically.
  return candidates.length === 0 ? fallback : candidates.reduce((a, b) => (a < b ? a : b));
};
