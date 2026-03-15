import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import InvestmentTransaction from '@models/investments/InvestmentTransaction.model';
import Portfolios from '@models/investments/Portfolios.model';
import Securities from '@models/investments/Securities.model';
import { withTransaction } from '@services/common/with-transaction';
import { format, parseISO } from 'date-fns';
import { Op, WhereOptions } from 'sequelize';

interface GetTransactionsParams {
  userId: number;
  portfolioId?: number;
  securityId?: number;
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
  // Build where clause
  const where: WhereOptions = {};

  // Add portfolio filter
  if (portfolioId) {
    // Check if portfolio belongs to the user and add it to the where clause in one query
    const portfolio = await Portfolios.findOne({
      where: { id: portfolioId, userId },
      attributes: ['id'], // Only fetch the ID to minimize data transfer
    });

    if (!portfolio) {
      throw new NotFoundError({ message: t({ key: 'investments.portfolioNotFound' }) });
    }

    where.portfolioId = portfolioId;
  } else {
    // If no specific portfolio is requested, use a subquery to get all portfolios for the user
    // This avoids fetching all portfolios into memory
    where.portfolioId = {
      [Op.in]: Portfolios.sequelize!.literal(`(SELECT id FROM "Portfolios" WHERE "userId" = ${userId})`),
    };
  }

  // Add security filter
  if (securityId) {
    where.securityId = securityId;
  }

  // Add category filter
  if (category) {
    where.category = category;
  }

  // Add date range filter
  if (startDate || endDate) {
    where.date = {};
    if (startDate) {
      // Parse ISO datetime string and format as YYYY-MM-DD
      const dateOnly = format(parseISO(startDate), 'yyyy-MM-dd');
      where.date[Op.gte] = dateOnly;
    }
    if (endDate) {
      // Parse ISO datetime string and format as YYYY-MM-DD
      const dateOnly = format(parseISO(endDate), 'yyyy-MM-dd');
      where.date[Op.lte] = dateOnly;
    }
  }

  // Use a more efficient query with separate count query to improve performance
  const [transactions, total] = await Promise.all([
    InvestmentTransaction.findAll({
      where,
      order: [['date', 'DESC']],
      limit,
      offset,
      include: [
        {
          model: Portfolios,
          as: 'portfolio',
          attributes: ['id', 'name'], // Only fetch needed fields
          where: { userId }, // Ensure user can only see their own portfolios
        },
        {
          model: Securities,
          as: 'security',
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
