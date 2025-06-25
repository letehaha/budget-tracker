import { NotFoundError } from '@js/errors';
import Currencies from '@models/Currencies.model';
import PortfolioBalances from '@models/investments/PortfolioBalances.model';
import Portfolios from '@models/investments/Portfolios.model';
import { withTransaction } from '@services/common';
import { WhereOptions } from 'sequelize';

interface GetPortfolioBalancesParams {
  userId: number;
  portfolioId: number;
  currencyId?: number; // If specified, return balance for specific currency only
}

const getPortfolioBalancesImpl = async ({ userId, portfolioId, currencyId }: GetPortfolioBalancesParams) => {
  // Verify portfolio exists and user owns it
  const portfolio = await Portfolios.findOne({
    where: { id: portfolioId, userId },
  });

  if (!portfolio) {
    throw new NotFoundError({ message: 'Portfolio not found' });
  }

  // Build where clause for balance query
  const where: WhereOptions<PortfolioBalances> = { portfolioId };
  if (currencyId !== undefined) {
    where.currencyId = currencyId;
  }

  // Get portfolio balances
  const balances = await PortfolioBalances.findAll({
    where,
    include: [
      {
        model: Currencies,
        as: 'currency',
      },
    ],
    order: [['currency', 'code', 'ASC']],
  });

  return balances;
};

export const getPortfolioBalances = withTransaction(getPortfolioBalancesImpl);
