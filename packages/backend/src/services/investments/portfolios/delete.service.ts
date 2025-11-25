import { ValidationError } from '@js/errors';
import Holdings from '@models/investments/Holdings.model';
import InvestmentTransaction from '@models/investments/InvestmentTransaction.model';
import PortfolioBalances from '@models/investments/PortfolioBalances.model';
import Portfolios from '@models/investments/Portfolios.model';
import { withTransaction } from '@services/common/with-transaction';

interface DeletePortfolioParams {
  userId: number;
  portfolioId: number;
  force?: boolean;
}

const deletePortfolioImpl = async ({ userId, portfolioId, force = false }: DeletePortfolioParams) => {
  // Find the portfolio and verify ownership
  const portfolio = await Portfolios.findOne({
    where: { id: portfolioId, userId },
    include: [
      { model: Holdings, as: 'holdings' },
      { model: InvestmentTransaction, as: 'investmentTransactions' },
      { model: PortfolioBalances, as: 'balances' },
    ],
  });

  if (!portfolio) {
    return { success: true };
  }

  // Check for active holdings unless force delete
  if (!force) {
    const hasActiveHoldings = portfolio.holdings && portfolio.holdings.length > 0;
    const hasTransactions = portfolio.investmentTransactions && portfolio.investmentTransactions.length > 0;
    const hasBalances =
      portfolio.balances &&
      portfolio.balances.some((balance) => parseFloat(balance.totalCash) > 0 || parseFloat(balance.availableCash) > 0);

    if (hasActiveHoldings) {
      throw new ValidationError({
        message: 'Cannot delete portfolio with active holdings. Transfer or sell holdings first, or use force delete.',
      });
    }

    if (hasTransactions) {
      throw new ValidationError({
        message: 'Cannot delete portfolio with transaction history. Use force delete to remove all data.',
      });
    }

    if (hasBalances) {
      throw new ValidationError({
        message: 'Cannot delete portfolio with cash balances. Transfer funds first, or use force delete.',
      });
    }
  }

  // If force delete, remove all related data first
  if (force) {
    // Delete related data in proper order (due to foreign key constraints)
    if (portfolio.holdings) {
      await Holdings.destroy({ where: { portfolioId } });
    }

    if (portfolio.investmentTransactions) {
      await InvestmentTransaction.destroy({ where: { portfolioId } });
    }

    if (portfolio.balances) {
      await PortfolioBalances.destroy({ where: { portfolioId } });
    }
  }

  // Delete the portfolio
  await portfolio.destroy();

  return { success: true };
};

export const deletePortfolio = withTransaction(deletePortfolioImpl);
