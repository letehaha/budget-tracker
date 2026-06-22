import { z } from 'zod';

// `create-new` branch: user wants the importer to create a fresh account.
// `currencyCode` is required (auto-filled from the detected CSV currency).
// `currentBalance` is the desired post-import balance; null means "sum of imported txns".
const createNewSchema = z.object({
  action: z.literal('create-new'),
  currencyCode: z.string().length(3),
  currentBalance: z.number().finite().nullable(),
});

// `link-existing` branch: transactions are posted to an already-existing account.
// `accountId` must be the UUID of the target account.
const linkExistingSchema = z.object({
  action: z.literal('link-existing'),
  accountId: z.string().min(1),
});

// Wallet's `create-new` variant carries `currencyCode` + `currentBalance`, which
// makes it a different shape from the CSV importer's `accountMappingValueSchema`
// in `../shared-schemas`. Kept separate to preserve the distinct contract.
export const walletAccountMappingSchema = z.record(
  z.string(),
  z.discriminatedUnion('action', [createNewSchema, linkExistingSchema]),
);
