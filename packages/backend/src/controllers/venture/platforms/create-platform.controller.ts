import { createController } from '@controllers/helpers/controller-factory';
import { createVenturePlatform } from '@services/venture/platforms/create.service';
import { z } from 'zod';

const pct = () =>
  z.coerce
    .number()
    .min(0)
    .max(1)
    .transform((v) => v.toString());

export default createController(
  z.object({
    body: z.object({
      name: z.string().trim().min(1).max(255),
      website: z.string().url().max(2000).nullable().optional(),
      description: z.string().max(2000).nullable().optional(),
      defaultEntryFeePct: pct().optional(),
      defaultMgmtFeePct: pct().optional(),
      defaultCarryPct: pct().optional(),
      defaultHurdlePct: pct().optional(),
    }),
  }),
  async ({ user, body }) => {
    const platform = await createVenturePlatform({
      userId: user.id,
      ...body,
    });
    return { data: platform };
  },
);
