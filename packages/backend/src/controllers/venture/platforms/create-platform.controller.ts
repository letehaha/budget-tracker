import { percentageFraction } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeVenturePlatform } from '@root/serializers';
import { createVenturePlatform } from '@services/venture/platforms/create.service';
import { z } from 'zod';

export default createController(
  z.object({
    body: z.object({
      name: z.string().trim().min(1).max(255),
      website: z.string().url().max(2000).nullable().optional(),
      description: z.string().max(2000).nullable().optional(),
      defaultEntryFeePct: percentageFraction().optional(),
      defaultMgmtFeePct: percentageFraction().optional(),
      defaultCarryPct: percentageFraction().optional(),
      defaultHurdlePct: percentageFraction().optional(),
    }),
  }),
  async ({ user, body }) => {
    const platform = await createVenturePlatform({
      userId: user.id,
      ...body,
    });
    return { data: serializeVenturePlatform(platform) };
  },
);
