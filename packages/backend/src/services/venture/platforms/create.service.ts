import { ConflictError } from '@js/errors';
import VenturePlatforms from '@models/venture/venture-platforms.model';
import { withTransaction } from '@services/common/with-transaction';

interface CreateVenturePlatformParams {
  userId: number;
  name: string;
  website?: string | null;
  description?: string | null;
  defaultEntryFeePct?: string;
  defaultMgmtFeePct?: string;
  defaultCarryPct?: string;
  defaultHurdlePct?: string;
}

const createVenturePlatformImpl = async ({
  userId,
  name,
  website = null,
  description = null,
  defaultEntryFeePct = '0',
  defaultMgmtFeePct = '0',
  defaultCarryPct = '0',
  defaultHurdlePct = '0',
}: CreateVenturePlatformParams) => {
  const trimmedName = name.trim();

  const duplicate = await VenturePlatforms.findOne({
    where: { userId, name: trimmedName },
  });
  if (duplicate) {
    throw new ConflictError({ message: 'A platform with this name already exists' });
  }

  const platform = await VenturePlatforms.create({
    userId,
    name: trimmedName,
    website,
    description,
    defaultEntryFeePct,
    defaultMgmtFeePct,
    defaultCarryPct,
    defaultHurdlePct,
  });

  return platform;
};

export const createVenturePlatform = withTransaction(createVenturePlatformImpl);
