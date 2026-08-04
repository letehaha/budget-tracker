import { currencyCode, recordId } from '@common/lib/zod/custom-types';
import { z } from 'zod';

import { boundedImportBalance } from '../shared-schemas';

// `create-new` branch: the importer creates a fresh account.
// `currencyCode` is required — it comes from the currency the parser read out of
// the Money file. `currentBalance` is the desired post-import balance; null means
// "sum of imported rows". Bounded to the INTEGER-cents storage cap so an over-cap
// value fails request validation instead of the balance write at the end of the job.
const createNewSchema = z.object({
  action: z.literal('create-new'),
  currencyCode: currencyCode(),
  currentBalance: boundedImportBalance({ label: 'Current balance' }).nullable(),
});

// `link-existing` branch: rows are posted to an already-existing account.
const linkExistingSchema = z.object({
  action: z.literal('link-existing'),
  accountId: recordId(),
});

// `skip` branch: the account and every row on it stay out of the import. A Money
// file usually holds accounts the user does not want (closed ones, unsupported
// types), and the import requires a stated decision for each parsed account
// rather than treating a missing entry as "skip".
const skipSchema = z.object({
  action: z.literal('skip'),
});

/**
 * Per-account decision, keyed by the account's name in the Money file
 * (`MsMoneyParseAccount.originalName`).
 */
export const msMoneyAccountMappingSchema = z.record(
  z.string(),
  z.discriminatedUnion('action', [createNewSchema, linkExistingSchema, skipSchema]),
);

/**
 * Id of the server-side cached parse result. A `.mny` file is uploaded and parsed
 * once, and every step after that references the result by this id instead of
 * re-sending the file. The cache generates it with `randomUUID`, so anything that
 * is not a UUID is rejected before it can reach the filesystem lookup.
 */
export const msMoneyUploadIdSchema = z.uuid();
