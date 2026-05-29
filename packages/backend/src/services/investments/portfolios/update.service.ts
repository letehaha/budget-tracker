import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import Portfolios from '@models/investments/portfolios.model';
import { Op } from '@sequelize/core';
import { withTransaction } from '@services/common/with-transaction';

interface UpdatePortfolioParams {
  userId: number;
  portfolioId: string;
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

  // Duplicate names are allowed — see the matching note in create.service.ts.

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
