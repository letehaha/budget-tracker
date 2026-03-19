import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { ConflictError } from '@js/errors';
import Portfolios from '@models/investments/portfolios.model';
import { withTransaction } from '@services/common/with-transaction';
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
  const portfolio = await findOrThrowNotFound({
    query: Portfolios.findOne({
      where: { id: portfolioId, userId },
    }),
    message: t({ key: 'investments.portfolioNotFound' }),
  });

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
      throw new ConflictError({ message: t({ key: 'investments.portfolioNameExists' }) });
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
