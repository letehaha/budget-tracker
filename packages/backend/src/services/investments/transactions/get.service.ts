import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { NotFoundError } from '@js/errors';
import * as AccountModel from '@models/Accounts.model';
import InvestmentTransaction from '@models/investments/InvestmentTransaction.model';
import { withTransaction } from '@services/common';
import { format, parseISO } from 'date-fns';
import { Op, WhereOptions } from 'sequelize';

interface GetTransactionsParams {
  userId: number;
  accountId?: number;
  securityId?: number;
  category?: INVESTMENT_TRANSACTION_CATEGORY;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

const serviceImpl = async ({
  userId,
  accountId,
  securityId,
  category,
  startDate,
  endDate,
  limit = 20,
  offset = 0,
}: GetTransactionsParams) => {
  // If accountId is provided, verify it belongs to the user
  if (accountId) {
    const account = await AccountModel.getAccountById({ id: accountId, userId });
    if (!account) {
      throw new NotFoundError({ message: 'Account not found' });
    }
  }

  // Build where clause
  const where: WhereOptions = {};

  // Add account filter
  if (accountId) {
    where.accountId = accountId;
  } else {
    // If no specific account is requested, get all accounts for the user
    const userAccounts = await AccountModel.getAccounts({ userId });
    where.accountId = {
      [Op.in]: userAccounts.map((account) => account.id),
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
        model: AccountModel.default,
        as: 'account',
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
