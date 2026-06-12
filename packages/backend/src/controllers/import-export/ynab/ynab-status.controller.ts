import { createController } from '@controllers/helpers/controller-factory';
import { NotFoundError } from '@js/errors';
import { getYnabImportProgress } from '@root/services/import-export/ynab-import';
import { z } from 'zod';

export const ynabStatusController = createController(
  z.object({
    params: z.object({
      jobId: z.string().min(1),
    }),
  }),
  async ({ user, params }) => {
    const progress = await getYnabImportProgress({ userId: user.id, jobId: params.jobId });
    if (!progress) {
      throw new NotFoundError({ message: 'YNAB import job not found.' });
    }
    return { data: progress };
  },
);
