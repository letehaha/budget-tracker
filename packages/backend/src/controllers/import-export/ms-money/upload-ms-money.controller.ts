import type { MsMoneyUploadResponse } from '@bt/shared/types';
import { MS_MONEY_MAX_FILE_BYTES } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { ValidationError } from '@js/errors';
import { parseMsMoneyFile, storeMsMoneyUpload } from '@services/import-export/ms-money-import';
import { z } from 'zod';

/**
 * Header carrying the file's password. The request body is the file's raw bytes,
 * so the password cannot travel with it, and a query string would end up in
 * access logs and proxy history.
 */
const PASSWORD_HEADER = 'x-file-password';

// Money's own password field is short. The cap stops a bloated header from
// reaching the key derivation. An empty value means "no password set".
const passwordHeaderSchema = z.string().max(255).optional();

const MAX_FILE_MB = MS_MONEY_MAX_FILE_BYTES / (1024 * 1024);

/**
 * Accepts one `.mny` file as a raw binary body, parses it, and caches the parse
 * result under an id the later wizard steps send back. The file itself is never
 * stored and never re-sent.
 *
 * The body is a Buffer rather than JSON, so there is nothing for the shared body
 * schema to validate — the password header is checked with zod here and the
 * buffer by hand.
 */
export const uploadMsMoneyController = createController(z.object({}), async ({ user, req }) => {
  const body: unknown = req.body;

  // `express.raw` leaves the body as an empty object when the request carried no
  // octet-stream payload at all.
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new ValidationError({ message: 'No file was uploaded. Send the .mny file as the raw request body.' });
  }

  // The route's raw parser caps the body as well, but answers with Express's own
  // error page. Restating the rule here keeps the response in the API envelope.
  if (body.length > MS_MONEY_MAX_FILE_BYTES) {
    throw new ValidationError({ message: `File is too large. The maximum .mny size is ${MAX_FILE_MB}MB.` });
  }

  const rawPassword = req.headers[PASSWORD_HEADER];
  const parsedPassword = passwordHeaderSchema.safeParse(Array.isArray(rawPassword) ? rawPassword[0] : rawPassword);
  if (!parsedPassword.success) {
    throw new ValidationError({ message: 'The supplied file password is not valid.' });
  }

  const result = parseMsMoneyFile({ buffer: body, password: parsedPassword.data || null });
  const { uploadId, expiresAt } = await storeMsMoneyUpload({ userId: user.id, result });

  const data: MsMoneyUploadResponse = { uploadId, result, expiresAt: expiresAt.toISOString() };
  return { data };
});
