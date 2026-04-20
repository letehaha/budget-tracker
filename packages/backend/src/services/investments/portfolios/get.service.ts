import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import Portfolios from '@models/investments/portfolios.model';
import { withTransaction } from '@services/common/with-transaction';

interface GetPortfolioParams {
  userId: number;
  portfolioId: number;
}

const getPortfolioImpl = async ({ userId, portfolioId }: GetPortfolioParams) => {
  const portfolio = await findOrThrowNotFound({
    query: Portfolios.findOne({
      where: { id: portfolioId, userId },
    }),
    message: t({ key: 'investments.portfolioNotFound' }),
  });

  return portfolio;
};

export const getPortfolio = withTransaction(getPortfolioImpl);
