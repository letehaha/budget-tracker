import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import Currencies from '@models/Currencies.model';
import PortfolioBalances from '@models/investments/PortfolioBalances.model';
import Portfolios from '@models/investments/Portfolios.model';
import { withTransaction } from '@services/common/with-transaction';
import { WhereOptions } from 'sequelize';

interface GetPortfolioBalancesParams {
  userId: number;
  portfolioId: number;
  currencyCode?: string; // If specified, return balance for specific currency only
}

const getPortfolioBalancesImpl = async ({ userId, portfolioId, currencyCode }: GetPortfolioBalancesParams) => {
  // Verify portfolio exists and user owns it
  await findOrThrowNotFound({
    query: Portfolios.findOne({
      where: { id: portfolioId, userId },
    }),
    message: t({ key: 'investments.portfolioNotFound' }),
  });

  // Build where clause for balance query
  const where: WhereOptions<PortfolioBalances> = { portfolioId };
  if (currencyCode !== undefined) {
    where.currencyCode = currencyCode;
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
