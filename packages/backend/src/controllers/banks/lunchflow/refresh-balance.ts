import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as lunchflowService from '@services/banks/lunchflow/refresh-balance';
import { z } from 'zod';

const schema = z.object({
  query: z.object({
    accountId: z.string().transform((val) => recordId().parse(val)),
  }),
});

export default createController(schema, async ({ user, query }) => {
  const data = await lunchflowService.refreshBalance({
    userId: user.id,
    accountId: query.accountId,
  });

  return { data };
});
