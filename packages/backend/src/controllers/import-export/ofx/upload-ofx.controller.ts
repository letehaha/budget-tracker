import type { OfxUploadResponse } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { ValidationError } from '@js/errors';
import { parseOfxFile, storeOfxUpload } from '@services/import-export/ofx-import';
import { z } from 'zod';

export const uploadOfxController = createController(z.object({}), async ({ user, req }) => {
  const body: unknown = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new ValidationError({ message: 'No file was uploaded. Send the OFX or QFX file as the raw request body.' });
  }

  const result = parseOfxFile({ bytes: body, timezone: req.get('X-Timezone') });
  const { uploadId, lease } = await storeOfxUpload({ userId: user.id, result });
  const data: OfxUploadResponse = { uploadId, result, lease };
  return { data };
});
