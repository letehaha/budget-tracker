import VenturePlatforms from '@models/venture/venture-platforms.model';
import { withTransaction } from '@services/common/with-transaction';

interface ListVenturePlatformsParams {
  userId: number;
  limit?: number;
  offset?: number;
}

const listVenturePlatformsImpl = async ({ userId, limit, offset }: ListVenturePlatformsParams) => {
  return VenturePlatforms.findAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
};

export const listVenturePlatforms = withTransaction(listVenturePlatformsImpl);
