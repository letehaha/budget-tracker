import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { updateVenturePlatform } from '@services/venture/platforms/update.service';
import { z } from 'zod';

const pct = () =>
  z.coerce
    .number()
    .min(0)
    .max(1)
    .transform((v) => v.toString());

export default createController(
  z.object({
    params: z.object({ id: recordId() }),
    body: z
      .object({
        name: z.string().trim().min(1).max(255).optional(),
        website: z.string().url().max(2000).nullable().optional(),
        description: z.string().max(2000).nullable().optional(),
        defaultEntryFeePct: pct().optional(),
        defaultMgmtFeePct: pct().optional(),
        defaultCarryPct: pct().optional(),
        defaultHurdlePct: pct().optional(),
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
    return { data: platform };
  },
);
