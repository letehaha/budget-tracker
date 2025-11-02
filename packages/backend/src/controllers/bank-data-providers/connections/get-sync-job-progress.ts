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
  async ({ query }) => {
    const progress = await getJobGroupProgress(query.jobGroupId);

    return {
      data: progress,
    };
  },
);
