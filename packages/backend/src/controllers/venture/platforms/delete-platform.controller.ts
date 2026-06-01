import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { deleteVenturePlatform } from '@services/venture/platforms/delete.service';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({ id: recordId() }),
    body: z
      .object({
        force: z.boolean().optional(),
      })
      .optional(),
  }),
  async ({ user, params, body }) => {
    const result = await deleteVenturePlatform({
      userId: user.id,
      platformId: params.id,
      force: body?.force,
    });
    return { data: result };
  },
);
