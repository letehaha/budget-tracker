import SecurityPricing from '@models/investments/SecurityPricing.model';
import { withTransaction } from '@services/common/with-transaction';
import { Op, WhereOptions } from 'sequelize';

interface PriceQueryOptions {
  securityId?: number;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Fetches security prices based on a flexible set of query options.
 * @param options - The query options including securityId and date ranges.
 */
const getPricesImpl = async (options: PriceQueryOptions): Promise<SecurityPricing[]> => {
  const where: WhereOptions<SecurityPricing> = {};

  if (options.securityId) {
    where.securityId = options.securityId;
  }

  if (options.startDate || options.endDate) {
    where.date = {};
    if (options.startDate) {
      where.date[Op.gte] = options.startDate;
    }
    if (options.endDate) {
      where.date[Op.lte] = options.endDate;
    }
  }

  return SecurityPricing.findAll({ where });
};

export const getPrices = withTransaction(getPricesImpl);
