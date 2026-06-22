import { createController } from '@controllers/helpers/controller-factory';
import { parseWalletCsv } from '@services/import-export/wallet-import';
import { z } from 'zod';

export const parseWalletController = createController(
  z.object({
    body: z.object({
      fileContent: z.string().min(1, 'File content cannot be empty'),
    }),
  }),
  async ({ body }) => {
    const { fileContent } = body;
    const result = parseWalletCsv({ fileContent });
    return { data: { result } };
  },
);
