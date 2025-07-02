import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { NotFoundError } from '@js/errors';
import InvestmentTransaction from '@models/investments/InvestmentTransaction.model';
import Portfolios from '@models/investments/Portfolios.model';
import { withTransaction } from '@services/common';
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
  // If portfolioId is provided, verify it belongs to the user
  if (portfolioId) {
    const portfolio = await Portfolios.findOne({
      where: { id: portfolioId, userId },
    });
    if (!portfolio) {
      throw new NotFoundError({ message: 'Portfolio not found' });
    }
  }

  // Build where clause
  const where: WhereOptions = {};

  // Add portfolio filter
  if (portfolioId) {
    where.portfolioId = portfolioId;
  } else {
    // If no specific portfolio is requested, get all portfolios for the user
    const userPortfolios = await Portfolios.findAll({
      where: { userId },
      attributes: ['id'],
    });
    where.portfolioId = {
      [Op.in]: userPortfolios.map((portfolio) => portfolio.id),
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

  // Get transactions with pagination
  const transactions = await InvestmentTransaction.findAndCountAll({
    where,
    order: [['date', 'DESC']],
    limit,
    offset,
    include: [
      {
        model: Portfolios,
        as: 'portfolio',
        attributes: ['id', 'name'],
      },
    ],
  });

  return {
    transactions: transactions.rows,
    total: transactions.count,
    limit,
    offset,
  };
};

export const getTransactions = withTransaction(serviceImpl);
