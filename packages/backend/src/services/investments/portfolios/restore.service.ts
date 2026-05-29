import { NotFoundError, ValidationError } from '@js/errors';
import Portfolios from '@models/investments/portfolios.model';
import { withTransaction } from '@services/common/with-transaction';

interface RestorePortfolioParams {
  userId: number;
  portfolioId: string;
}

const restorePortfolioImpl = async ({ userId, portfolioId }: RestorePortfolioParams) => {
  const portfolio = await Portfolios.findOne({
    where: { id: portfolioId, userId },
    paranoid: false,
  });

  if (!portfolio) {
    throw new NotFoundError({ message: 'Portfolio not found' });
  }

  if (portfolio.deletedAt == null) {
    throw new ValidationError({ message: 'Portfolio is not deleted' });
  }

  await portfolio.restore();

  return portfolio;
};

export const restorePortfolio = withTransaction(restorePortfolioImpl);
