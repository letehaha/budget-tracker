import Holdings from '@models/investments/holdings.model';
import InvestmentTransaction from '@models/investments/investment-transaction.model';
import PortfolioBalances from '@models/investments/portfolio-balances.model';
import Portfolios from '@models/investments/portfolios.model';
import { withTransaction } from '@services/common/with-transaction';

interface DeletePortfolioParams {
  userId: number;
  portfolioId: string;
  /**
   * When true, hard-deletes the portfolio and cascades to all related rows
   * (holdings, investment transactions, balances) — irreversible. Used by:
   *   - the trash UI's "Delete now" button (user opts out of the 30-day window);
   *   - the purge cron (finalises portfolios past the retention window).
   * When false (default), performs a soft-delete that can be restored.
   */
  force?: boolean;
}

const deletePortfolioImpl = async ({ userId, portfolioId, force = false }: DeletePortfolioParams) => {
  // Look up across both live and soft-deleted rows so a second delete on a
  // trashed portfolio is still a no-op success (idempotency).
  const portfolio = await Portfolios.findOne({
    where: { id: portfolioId, userId },
    paranoid: false,
  });

  if (!portfolio) {
    return { success: true };
  }

  if (force) {
    await Holdings.destroy({ where: { portfolioId } });
    await InvestmentTransaction.destroy({ where: { portfolioId } });
    await PortfolioBalances.destroy({ where: { portfolioId } });
    await portfolio.destroy({ force: true });
    return { success: true };
  }

  // Soft delete: Sequelize sets deletedAt; child rows stay and become invisible
  // to all paranoid queries because every read path filters by portfolioId from
  // a Portfolios query (which now hides soft-deleted parents) or includes
  // Portfolios in the join.
  await portfolio.destroy();

  return { success: true };
};

export const deletePortfolio = withTransaction(deletePortfolioImpl);
