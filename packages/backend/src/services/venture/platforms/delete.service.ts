import VenturePlatforms from '@models/venture/venture-platforms.model';
import { withTransaction } from '@services/common/with-transaction';

interface DeleteVenturePlatformParams {
  userId: number;
  platformId: string;
  /** Hard-delete and break association from any deals (deals retain platformId=null via FK SET NULL). */
  force?: boolean;
}

const deleteVenturePlatformImpl = async ({ userId, platformId, force = false }: DeleteVenturePlatformParams) => {
  // Look across both live + soft-deleted so a second delete is idempotent.
  const platform = await VenturePlatforms.findOne({
    where: { id: platformId, userId },
    paranoid: false,
  });

  if (!platform) return { success: true };

  await platform.destroy({ force });
  return { success: true };
};

export const deleteVenturePlatform = withTransaction(deleteVenturePlatformImpl);
