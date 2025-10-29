import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as lunchflowService from '@services/banks/lunchflow/sync-transactions';
import { z } from 'zod';

const schema = z.object({
  body: z.object({
    accountId: recordId(),
  }),
});

export default createController(schema, async ({ user, body }) => {
  const data = await lunchflowService.syncTransactions({
    userId: user.id,
    accountId: body.accountId,
  });

  return { data };
});
