import type { DetectOfxDuplicatesResponse } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { detectOfxDuplicates } from '@services/import-export/ofx-import';
import { z } from 'zod';

import { ofxAccountMappingSchema, ofxUploadIdSchema } from './shared-schemas';

export const detectOfxDuplicatesController = createController(
  z.object({ body: z.object({ uploadId: ofxUploadIdSchema, accountMapping: ofxAccountMappingSchema }) }),
  async ({ user, body }) => {
    const data: DetectOfxDuplicatesResponse = await detectOfxDuplicates({ userId: user.id, ...body });
    return { data };
  },
);
