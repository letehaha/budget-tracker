import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
import Portfolios from '@models/investments/portfolios.model';
import { withTransaction } from '@services/common/with-transaction';

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
  // Duplicate names are allowed — the (userId, name) DB constraint was dropped
  // because it collided with soft-delete and the product call is to not bother
  // the user about it.
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
