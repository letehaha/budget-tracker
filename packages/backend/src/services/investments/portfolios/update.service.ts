import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
import { ConflictError, NotFoundError } from '@js/errors';
import Portfolios from '@models/investments/Portfolios.model';
import { withTransaction } from '@services/common';
import { Op } from 'sequelize';

interface UpdatePortfolioParams {
  userId: number;
  portfolioId: number;
  name?: string;
  portfolioType?: PORTFOLIO_TYPE;
  description?: string | null;
  isEnabled?: boolean;
}

const updatePortfolioImpl = async ({
  userId,
  portfolioId,
  name,
  portfolioType,
  description,
  isEnabled,
}: UpdatePortfolioParams) => {
  // Find the portfolio and verify ownership
  const portfolio = await Portfolios.findOne({
    where: { id: portfolioId, userId },
  });

  if (!portfolio) {
    throw new NotFoundError({ message: 'Portfolio not found' });
  }

  // Check if another portfolio with same name already exists for this user (only if name is being updated)
  if (name !== undefined) {
    const existingPortfolio = await Portfolios.findOne({
      where: {
        userId,
        name: name.trim(),
        id: { [Op.ne]: portfolioId }, // Exclude current portfolio
      },
    });

    if (existingPortfolio) {
      throw new ConflictError({ message: 'Portfolio with this name already exists' });
    }
  }

  // Update the portfolio with only provided fields
  const updateData: Partial<Portfolios> = {};

  if (name !== undefined) updateData.name = name.trim();
  if (portfolioType !== undefined) updateData.portfolioType = portfolioType;
  if (description !== undefined) updateData.description = description;
  if (isEnabled !== undefined) updateData.isEnabled = isEnabled;

  await portfolio.update(updateData);

  return portfolio.reload();
};

export const updatePortfolio = withTransaction(updatePortfolioImpl);
