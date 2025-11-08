import { createController } from '@controllers/helpers/controller-factory';
import { getActiveJobsForUser } from '@root/services/bank-data-providers/monobank/transaction-sync-queue';
import { z } from 'zod';

export default createController(z.object({}), async ({ user }) => {
  const activeJobs = await getActiveJobsForUser(user.id);

  return {
    data: {
      jobs: activeJobs,
    },
  };
});
