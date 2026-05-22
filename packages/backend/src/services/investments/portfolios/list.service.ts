import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
import Portfolios from '@models/investments/portfolios.model';
import { withTransaction } from '@services/common/with-transaction';
import { FindOptions, Op, WhereOptions } from 'sequelize';

interface ListPortfoliosParams {
  userId: number;
  portfolioType?: PORTFOLIO_TYPE;
  isEnabled?: boolean;
  /** When true, returns ONLY soft-deleted portfolios (for the trash view). */
  onlyDeleted?: boolean;
  limit?: number;
  offset?: number;
}

const listPortfoliosImpl = async ({
  userId,
  portfolioType,
  isEnabled,
  onlyDeleted = false,
  limit,
  offset,
}: ListPortfoliosParams) => {
  const where: WhereOptions<Portfolios> = { userId };

  // Add optional filters
  if (portfolioType !== undefined) {
    where.portfolioType = portfolioType;
  }

  if (isEnabled !== undefined) {
    where.isEnabled = isEnabled;
  }

  if (onlyDeleted) {
    // Bypass paranoid (so trash rows surface) AND constrain to non-null
    // deletedAt so live rows don't leak in. `Op.not` against `null` produces
    // `IS NOT NULL` in SQL.
    where.deletedAt = { [Op.not]: null };
  }

  const options: FindOptions<Portfolios> = {
    where,
    order: onlyDeleted ? [['deletedAt', 'DESC']] : [['createdAt', 'DESC']],
    paranoid: !onlyDeleted,
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
