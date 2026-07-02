import { currencyCode } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { queueYnabImport } from '@root/services/import-export/ynab-import';
import { z } from 'zod';

const accountMappingValueSchema = z.object({
  currencyCode: currencyCode(),
});

export const executeYnabController = createController(
  z.object({
    body: z.object({
      fileContent: z.string().min(1, 'File content cannot be empty'),
      accountMapping: z.record(z.string(), accountMappingValueSchema),
    }),
  }),
  async ({ user, body }) => {
    const { fileContent, accountMapping } = body;
    const jobId = await queueYnabImport({
      userId: user.id,
      fileContent,
      accountMapping,
    });
    return { data: { jobId } };
  },
);
