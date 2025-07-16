import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
import { ConflictError } from '@js/errors';
import Portfolios from '@models/investments/Portfolios.model';
import { withTransaction } from '@services/common';

interface CreatePortfolioParams {
  userId: number;
  name: string;
  portfolioType: PORTFOLIO_TYPE;
  description?: string | null;
  isEnabled?: boolean;
}

const createPortfolioImpl = async ({
  userId,
  name,
  portfolioType,
  description = null,
  isEnabled = true,
}: CreatePortfolioParams) => {
  // Check if portfolio with same name already exists for this user
  const existingPortfolio = await Portfolios.findOne({
    where: {
      userId,
      name: name.trim(),
    },
  });

  if (existingPortfolio) {
    throw new ConflictError({ message: 'Portfolio with this name already exists' });
  }

  // Create the portfolio
  const portfolio = await Portfolios.create({
    userId,
    name: name.trim(),
    portfolioType,
    description,
    isEnabled,
  });

  return portfolio;
};

export const createPortfolio = withTransaction(createPortfolioImpl);
