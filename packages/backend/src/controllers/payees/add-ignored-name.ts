import { createController } from '@controllers/helpers/controller-factory';
import * as payeesService from '@services/payees';
import { z } from 'zod';

const schema = z.object({
  body: z.object({
    rawName: z.string().trim().min(1).max(500),
    force: z.boolean().optional(),
  }),
});

export default createController(schema, async ({ user, body }) => {
  const row = await payeesService.addPayeeIgnoredName({
    userId: user.id,
    rawName: body.rawName,
    force: body.force,
  });
  return {
    data: {
      id: row.id,
      normalizedName: row.normalizedName,
      rawSample: row.rawSample,
      createdAt: row.createdAt.toISOString(),
    },
  };
});
