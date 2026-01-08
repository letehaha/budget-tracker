import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import Currencies from '@models/Currencies.model';
import PortfolioTransfers from '@models/investments/PortfolioTransfers.model';
import Portfolios from '@models/investments/Portfolios.model';
import { Op } from 'sequelize';

interface ListPortfolioTransfersParams {
  userId: number;
  portfolioId: number;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'date' | 'amount';
  sortDirection?: 'ASC' | 'DESC';
}

export async function listPortfolioTransfers({
  userId,
  portfolioId,
  dateFrom,
  dateTo,
  limit = 20,
  offset = 0,
  sortBy = 'date',
  sortDirection = 'DESC',
}: ListPortfolioTransfersParams) {
  // Verify portfolio exists and user owns it
  const portfolio = await Portfolios.findOne({
    where: { id: portfolioId, userId },
  });

  if (!portfolio) {
    throw new NotFoundError({ message: t({ key: 'investments.portfolioNotFound' }) });
  }

  // Build date filter if provided
  const dateFilter = {};
  if (dateFrom || dateTo) {
    dateFilter['date'] = {};
    if (dateFrom) {
      dateFilter['date'][Op.gte] = dateFrom;
    }
    if (dateTo) {
      dateFilter['date'][Op.lte] = dateTo;
    }
  }

  // Build where clause to find transfers involving this portfolio
  // (either as source or destination)
  const whereClause = {
    userId,
    [Op.or]: [{ fromPortfolioId: portfolioId }, { toPortfolioId: portfolioId }],
    ...dateFilter,
  };

  // Get total count for pagination
  const totalCount = await PortfolioTransfers.count({
    where: whereClause,
  });

  // Get transfers with sorting and pagination
  const transfers = await PortfolioTransfers.findAll({
    where: whereClause,
    include: [
      { model: Portfolios, as: 'fromPortfolio' },
      { model: Portfolios, as: 'toPortfolio' },
      { model: Currencies, as: 'currency' },
    ],
    order: [[sortBy, sortDirection]],
    limit,
    offset,
  });

  return {
    data: transfers,
    totalCount,
  };
}
