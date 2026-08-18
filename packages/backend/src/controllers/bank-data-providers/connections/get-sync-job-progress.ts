import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { getJobGroupProgress } from '@root/services/bank-data-providers/monobank/transaction-sync-queue';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      connectionId: recordId(),
    }),
    query: z.object({
      jobGroupId: z.string(),
    }),
  }),
  async ({ query, user }) => {
    const progress = await getJobGroupProgress({ jobGroupId: query.jobGroupId, userId: user.id });

    return {
      data: progress,
    };
  },
);
