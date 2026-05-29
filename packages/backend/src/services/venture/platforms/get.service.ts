import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import VenturePlatforms from '@models/venture/venture-platforms.model';
import { withTransaction } from '@services/common/with-transaction';

interface GetVenturePlatformParams {
  userId: number;
  platformId: string;
}

const getVenturePlatformImpl = async ({ userId, platformId }: GetVenturePlatformParams) => {
  return findOrThrowNotFound({
    query: VenturePlatforms.findOne({ where: { id: platformId, userId } }),
    message: 'Venture platform not found',
  });
};

export const getVenturePlatform = withTransaction(getVenturePlatformImpl);
