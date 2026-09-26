import { uniqueRecordIds } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as payeesService from '@services/payees';
import { z } from 'zod';

const MAX_BULK_DELETE_IDS = 2000;

const schema = z.object({
  body: z.object({
    ids: uniqueRecordIds({ min: 1, max: MAX_BULK_DELETE_IDS }),
    ignoreFuture: z.boolean().optional().default(false),
  }),
});

export default createController(schema, async ({ user, body }) => {
  const data = await payeesService.bulkDeletePayees({
    userId: user.id,
    ids: body.ids,
    ignoreFuture: body.ignoreFuture,
  });
  return { data };
});
