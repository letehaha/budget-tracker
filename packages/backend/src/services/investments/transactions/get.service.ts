import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { toUtcDateString } from '@common/utils/date';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import InvestmentTransaction from '@models/investments/investment-transaction.model';
import Portfolios from '@models/investments/portfolios.model';
import Securities from '@models/investments/securities.model';
import { withTransaction } from '@services/common/with-transaction';
import { Op, WhereOptions } from 'sequelize';

interface GetTransactionsParams {
  userId: number;
  portfolioId?: string;
  securityId?: string;
  category?: INVESTMENT_TRANSACTION_CATEGORY;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

const serviceImpl = async ({
  userId,
  portfolioId,
  securityId,
  category,
  startDate,
  endDate,
  limit = 20,
  offset = 0,
}: GetTransactionsParams) => {
  // Build where clause. User scoping comes from the Portfolios INNER JOIN
  // below (`include[].where = { userId }`), so we don't need a parallel
  // userId-filter subquery on portfolioId — that would be redundant and
  // previously string-interpolated userId into raw SQL.
  const where: WhereOptions = {};

  if (portfolioId) {
    // Check if portfolio belongs to the user and add it to the where clause in one query
    await findOrThrowNotFound({
      query: Portfolios.findOne({
        where: { id: portfolioId, userId },
        attributes: ['id'], // Only fetch the ID to minimize data transfer
      }),
      message: t({ key: 'investments.portfolioNotFound' }),
    });

    where.portfolioId = portfolioId;
  }

  // Add security filter
  if (securityId) {
    where.securityId = securityId;
  }

  // Add category filter
  if (category) {
    where.category = category;
  }

  // Add date range filter. `date` is TIMESTAMPTZ, so anchor both bounds to the
  // full UTC calendar day: lower = start-of-day UTC, upper = end-of-day UTC.
  // A bare `yyyy-MM-dd` upper bound would cast to midnight UTC and exclude that
  // day's intraday (afternoon) trades.
  if (startDate || endDate) {
    where.date = {};
    if (startDate) {
      const dayUtc = toUtcDateString(startDate);
      where.date[Op.gte] = `${dayUtc}T00:00:00.000Z`;
    }
    if (endDate) {
      const dayUtc = toUtcDateString(endDate);
      where.date[Op.lte] = `${dayUtc}T23:59:59.999Z`;
    }
  }

  // Use a more efficient query with separate count query to improve performance
  const [transactions, total] = await Promise.all([
    InvestmentTransaction.findAll({
      where,
      // `createdAt` breaks ties so same-instant rows (e.g. same-day trades that
      // share a TIMESTAMPTZ value) keep a stable, deterministic display order.
      order: [
        ['date', 'DESC'],
        ['createdAt', 'DESC'],
      ],
      limit,
      offset,
      attributes: [
        'id',
        'securityId',
        'portfolioId',
        'category',
        'date',
        'name',
        'quantity',
        'price',
        'fees',
        'amount',
        'refAmount',
        'refFees',
        'currencyCode',
        'settlementCurrencyCode',
        'settlementAmount',
        'settlementFees',
        'settlementRate',
        'createdAt',
      ],
      include: [
        {
          model: Portfolios,
          as: 'portfolio',
          attributes: ['id', 'name'],
          where: { userId }, // INNER JOIN enforces user scoping
        },
        {
          model: Securities,
          as: 'security',
          attributes: ['id', 'symbol', 'name', 'currencyCode', 'assetClass'],
        },
      ],
    }),
    InvestmentTransaction.count({
      where,
      include: [
        {
          model: Portfolios,
          as: 'portfolio',
          attributes: [],
          where: { userId },
        },
      ],
      distinct: true, // Important for accurate count with associations
    }),
  ]);

  return {
    transactions,
    total,
    limit,
    offset,
  };
};

export const getTransactions = withTransaction(serviceImpl);
