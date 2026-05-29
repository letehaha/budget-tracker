import { percentageFraction, recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeVenturePlatform } from '@root/serializers';
import { updateVenturePlatform } from '@services/venture/platforms/update.service';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({ id: recordId() }),
    body: z
      .object({
        name: z.string().trim().min(1).max(255).optional(),
        website: z.string().url().max(2000).nullable().optional(),
        description: z.string().max(2000).nullable().optional(),
        defaultEntryFeePct: percentageFraction().optional(),
        defaultMgmtFeePct: percentageFraction().optional(),
        defaultCarryPct: percentageFraction().optional(),
        defaultHurdlePct: percentageFraction().optional(),
      })
      .strict()
      .refine((data) => Object.keys(data).length > 0, {
        message: 'At least one field must be provided for update',
      }),
  }),
  async ({ user, params, body }) => {
    const platform = await updateVenturePlatform({
      userId: user.id,
      platformId: params.id,
      ...body,
    });
    return { data: serializeVenturePlatform(platform) };
  },
);
