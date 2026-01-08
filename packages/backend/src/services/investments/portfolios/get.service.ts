import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import Portfolios from '@models/investments/Portfolios.model';
import { withTransaction } from '@services/common/with-transaction';

interface GetPortfolioParams {
  userId: number;
  portfolioId: number;
}

const getPortfolioImpl = async ({ userId, portfolioId }: GetPortfolioParams) => {
  const portfolio = await Portfolios.findOne({
    where: { id: portfolioId, userId },
  });

  if (!portfolio) {
    throw new NotFoundError({ message: t({ key: 'investments.portfolioNotFound' }) });
  }

  return portfolio;
};

export const getPortfolio = withTransaction(getPortfolioImpl);
