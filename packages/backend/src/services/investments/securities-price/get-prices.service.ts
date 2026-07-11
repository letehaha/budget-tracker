import SecurityPricing from '@models/investments/security-pricing.model';
import { withTransaction } from '@services/common/with-transaction';
import { Op, WhereOptions } from 'sequelize';

interface PriceQueryOptions {
  securityId?: string;
  from?: Date;
  to?: Date;
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

  if (options.from || options.to) {
    where.date = {};
    if (options.from) {
      where.date[Op.gte] = options.from;
    }
    if (options.to) {
      where.date[Op.lte] = options.to;
    }
  }

  return SecurityPricing.findAll({ where });
};

export const getPrices = withTransaction(getPricesImpl);
