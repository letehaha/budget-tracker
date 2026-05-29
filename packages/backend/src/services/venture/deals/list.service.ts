import { VENTURE_DEAL_STATUS } from '@bt/shared/types/venture';
import Currencies from '@models/currencies.model';
import VentureDeals from '@models/venture/venture-deals.model';
import VenturePlatforms from '@models/venture/venture-platforms.model';
import { withTransaction } from '@services/common/with-transaction';
import { WhereOptions } from 'sequelize';

interface ListVentureDealsParams {
  userId: number;
  status?: VENTURE_DEAL_STATUS;
  platformId?: string;
  limit?: number;
  offset?: number;
}

const listVentureDealsImpl = async ({ userId, status, platformId, limit, offset }: ListVentureDealsParams) => {
  const where: WhereOptions<VentureDeals> = { userId };
  if (status !== undefined) where.status = status;
  if (platformId !== undefined) where.platformId = platformId;

  return VentureDeals.findAll({
    where,
    order: [
      ['investmentDate', 'DESC'],
      ['createdAt', 'DESC'],
    ],
    limit,
    offset,
    include: [
      { model: VenturePlatforms, as: 'platform' },
      { model: Currencies, as: 'currency' },
    ],
  });
};

export const listVentureDeals = withTransaction(listVentureDealsImpl);
