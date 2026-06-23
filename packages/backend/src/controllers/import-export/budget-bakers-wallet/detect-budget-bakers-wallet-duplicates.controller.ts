import { createController } from '@controllers/helpers/controller-factory';
import { detectBudgetBakersWalletDuplicates } from '@services/import-export/budget-bakers-wallet-import';
import { z } from 'zod';

import { budgetBakersWalletAccountMappingSchema } from './shared-schemas';

export const detectBudgetBakersWalletDuplicatesController = createController(
  z.object({
    body: z.object({
      fileContent: z.string().min(1, 'File content cannot be empty'),
      accountMapping: budgetBakersWalletAccountMappingSchema,
    }),
  }),
  async ({ user, body }) => {
    const { fileContent, accountMapping } = body;
    // The service already returns the `{ duplicates }` response shape, so spread
    // it straight into `data` — wrapping it again would double-nest as
    // `{ duplicates: { duplicates } }` and break the client's `.duplicates` read.
    const result = await detectBudgetBakersWalletDuplicates({ userId: user.id, fileContent, accountMapping });
    return { data: result };
  },
);
