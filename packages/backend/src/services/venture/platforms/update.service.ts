import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { ConflictError } from '@js/errors';
import VenturePlatforms from '@models/venture/venture-platforms.model';
import { Op } from '@sequelize/core';
import { withTransaction } from '@services/common/with-transaction';

interface UpdateVenturePlatformParams {
  userId: number;
  platformId: string;
  name?: string;
  website?: string | null;
  description?: string | null;
  defaultEntryFeePct?: string;
  defaultMgmtFeePct?: string;
  defaultCarryPct?: string;
  defaultHurdlePct?: string;
}

const updateVenturePlatformImpl = async ({
  userId,
  platformId,
  name,
  website,
  description,
  defaultEntryFeePct,
  defaultMgmtFeePct,
  defaultCarryPct,
  defaultHurdlePct,
}: UpdateVenturePlatformParams) => {
  const platform = await findOrThrowNotFound({
    query: VenturePlatforms.findOne({ where: { id: platformId, userId } }),
    message: 'Venture platform not found',
  });

  const updates: Partial<VenturePlatforms> = {};

  if (name !== undefined) {
    const trimmed = name.trim();
    if (trimmed !== platform.name) {
      const duplicate = await VenturePlatforms.findOne({
        where: { userId, name: trimmed, id: { [Op.ne]: platformId } },
      });
      if (duplicate) {
        throw new ConflictError({ message: 'A platform with this name already exists' });
      }
    }
    updates.name = trimmed;
  }
  if (website !== undefined) updates.website = website;
  if (description !== undefined) updates.description = description;
  if (defaultEntryFeePct !== undefined) updates.defaultEntryFeePct = defaultEntryFeePct;
  if (defaultMgmtFeePct !== undefined) updates.defaultMgmtFeePct = defaultMgmtFeePct;
  if (defaultCarryPct !== undefined) updates.defaultCarryPct = defaultCarryPct;
  if (defaultHurdlePct !== undefined) updates.defaultHurdlePct = defaultHurdlePct;

  await platform.update(updates);
  return platform.reload();
};

export const updateVenturePlatform = withTransaction(updateVenturePlatformImpl);
