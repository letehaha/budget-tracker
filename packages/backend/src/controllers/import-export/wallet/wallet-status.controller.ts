import { createController } from '@controllers/helpers/controller-factory';
import { NotFoundError } from '@js/errors';
import { getWalletImportProgress } from '@services/import-export/wallet-import';
import { z } from 'zod';

export const walletStatusController = createController(
  z.object({
    params: z.object({
      jobId: z.string().min(1),
    }),
  }),
  async ({ user, params }) => {
    const progress = await getWalletImportProgress({ userId: user.id, jobId: params.jobId });
    if (!progress) {
      throw new NotFoundError({ message: 'Wallet import job not found.' });
    }
    return { data: progress };
  },
);
