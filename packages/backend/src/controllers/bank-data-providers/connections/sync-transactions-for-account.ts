import { createController } from '@controllers/helpers/controller-factory';
import { syncTransactionsForAccount } from '@root/services/bank-data-providers/connection/sync-transactions-for-account';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      connectionId: z.coerce.number(),
    }),
    body: z.object({
      accountId: z.number(),
    }),
  }),
  async ({ user, params, body }) => {
    const result = await syncTransactionsForAccount({
      connectionId: params.connectionId,
      userId: user.id,
      accountId: body.accountId,
    });

    // Handle both queue-based (returns job info) and immediate sync (returns void)
    if (result && 'jobGroupId' in result) {
      return {
        data: {
          jobGroupId: result.jobGroupId,
          totalBatches: result.totalBatches,
          estimatedMinutes: result.estimatedMinutes,
          message: `Transaction sync queued. Estimated time: ${result.estimatedMinutes} minute(s)`,
        },
      };
    }

    return {
      data: {
        message: 'Transactions synced successfully',
      },
    };
  },
);
