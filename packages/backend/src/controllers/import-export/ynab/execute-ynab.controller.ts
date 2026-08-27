import { currencyCode } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { queueYnabImport } from '@root/services/import-export/ynab-import';
import { z } from 'zod';

// A skipped account is never created, so an empty `currencyCode` is valid on it.
// The refine re-issues the shared validator's message at the `currencyCode` path
// so the client can attach it to the picker.
const accountMappingValueSchema = z
  .object({ skip: z.boolean().optional(), currencyCode: z.string().trim().toUpperCase() })
  .superRefine((mapping, ctx) => {
    if (mapping.skip) return;

    const parsed = currencyCode().safeParse(mapping.currencyCode);
    if (!parsed.success) {
      ctx.addIssue({ code: 'custom', message: parsed.error.issues[0]!.message, path: ['currencyCode'] });
    }
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
