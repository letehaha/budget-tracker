import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
import Portfolios from '@models/investments/portfolios.model';
import { FindOptions, InferAttributes, WhereOptions } from '@sequelize/core';
import { withTransaction } from '@services/common/with-transaction';

interface ListPortfoliosParams {
  userId: number;
  portfolioType?: PORTFOLIO_TYPE;
  isEnabled?: boolean;
  limit?: number;
  offset?: number;
}

const listPortfoliosImpl = async ({ userId, portfolioType, isEnabled, limit, offset }: ListPortfoliosParams) => {
  const where: WhereOptions<Portfolios> = { userId };

  // Add optional filters
  if (portfolioType !== undefined) {
    where.portfolioType = portfolioType;
  }

  if (isEnabled !== undefined) {
    where.isEnabled = isEnabled;
  }

  const options: FindOptions<InferAttributes<Portfolios>> = {
    where,
    order: [['createdAt', 'DESC']],
  };

  if (limit !== undefined) {
    options.limit = limit;
  }

  if (offset !== undefined) {
    options.offset = offset;
  }

  const portfolios = await Portfolios.findAll(options);

  return portfolios;
};

export const listPortfolios = withTransaction(listPortfoliosImpl);
