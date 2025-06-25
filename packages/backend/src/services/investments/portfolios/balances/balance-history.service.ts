import { NotFoundError } from '@js/errors';
import Currencies from '@models/Currencies.model';
import PortfolioBalances from '@models/investments/PortfolioBalances.model';
import Portfolios from '@models/investments/Portfolios.model';
import { withTransaction } from '@services/common';
import { Op, WhereOptions } from 'sequelize';

interface GetBalanceHistoryParams {
  userId: number;
  portfolioId: number;
  currencyId?: number;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

interface BalanceSnapshot {
  portfolioId: number;
  currencyId: number;
  availableCash: string;
  totalCash: string;
  refAvailableCash: string;
  refTotalCash: string;
  snapshotDate: Date;
  currency: {
    id: number;
    code: string;
    currency: string;
  };
}

const getPortfolioBalanceHistoryImpl = async ({
  userId,
  portfolioId,
  currencyId,
  startDate,
  endDate,
  limit = 100,
  offset = 0,
}: GetBalanceHistoryParams) => {
  // Verify portfolio exists and user owns it
  const portfolio = await Portfolios.findOne({
    where: { id: portfolioId, userId },
  });

  if (!portfolio) {
    throw new NotFoundError({ message: 'Portfolio not found' });
  }

  // Build where clause for balance query
  const where: WhereOptions<PortfolioBalances> = { portfolioId };

  if (currencyId !== undefined) {
    where.currencyId = currencyId;
  }

  if (startDate || endDate) {
    where.updatedAt = {};
    if (startDate) {
      where.updatedAt[Op.gte] = startDate;
    }
    if (endDate) {
      where.updatedAt[Op.lte] = endDate;
    }
  }

  // Get current balances (this would be extended to include historical snapshots in the future)
  const balances = await PortfolioBalances.findAll({
    where,
    include: [
      {
        model: Currencies,
        as: 'currency',
        attributes: ['id', 'code', 'currency'],
      },
    ],
    order: [['updatedAt', 'DESC']],
    limit,
    offset,
  });

  // Transform to balance snapshots format
  const balanceHistory: BalanceSnapshot[] = balances.map((balance) => ({
    portfolioId: balance.portfolioId,
    currencyId: balance.currencyId,
    availableCash: balance.availableCash,
    totalCash: balance.totalCash,
    refAvailableCash: balance.refAvailableCash,
    refTotalCash: balance.refTotalCash,
    snapshotDate: balance.updatedAt,
    currency: {
      id: balance.currency?.id || 0,
      code: balance.currency?.code || '',
      currency: balance.currency?.currency || '',
    },
  }));

  return {
    portfolioId,
    history: balanceHistory,
    pagination: {
      limit,
      offset,
      total: balances.length,
    },
  };
};

// Service to create balance snapshots (for future implementation)
interface CreateBalanceSnapshotParams {
  userId: number;
  portfolioId: number;
  reason?: string; // e.g., 'transaction', 'transfer', 'manual_adjustment'
}

const createBalanceSnapshotImpl = async ({ userId, portfolioId, reason = 'manual' }: CreateBalanceSnapshotParams) => {
  // Verify portfolio exists and user owns it
  const portfolio = await Portfolios.findOne({
    where: { id: portfolioId, userId },
  });

  if (!portfolio) {
    throw new NotFoundError({ message: 'Portfolio not found' });
  }

  // Get current balances
  const currentBalances = await PortfolioBalances.findAll({
    where: { portfolioId },
    include: [
      {
        model: Currencies,
        as: 'currency',
        attributes: ['id', 'code', 'currency'],
      },
    ],
  });

  // In a real implementation, this would create historical snapshot records
  // For now, we just return the current state
  return {
    portfolioId,
    snapshotDate: new Date(),
    reason,
    balances: currentBalances,
  };
};

export const getPortfolioBalanceHistory = withTransaction(getPortfolioBalanceHistoryImpl);
export const createBalanceSnapshot = withTransaction(createBalanceSnapshotImpl);
