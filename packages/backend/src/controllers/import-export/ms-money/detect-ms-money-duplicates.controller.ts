import type { DetectMsMoneyDuplicatesResponse } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { detectMsMoneyDuplicates } from '@services/import-export/ms-money-import';
import { z } from 'zod';

import { msMoneyAccountMappingSchema, msMoneyUploadIdSchema } from './shared-schemas';

export const detectMsMoneyDuplicatesController = createController(
  z.object({
    body: z.object({
      uploadId: msMoneyUploadIdSchema,
      accountMapping: msMoneyAccountMappingSchema,
    }),
  }),
  async ({ user, body }) => {
    const { uploadId, accountMapping } = body;
    const data: DetectMsMoneyDuplicatesResponse = await detectMsMoneyDuplicates({
      userId: user.id,
      uploadId,
      accountMapping,
    });
    return { data };
  },
);
