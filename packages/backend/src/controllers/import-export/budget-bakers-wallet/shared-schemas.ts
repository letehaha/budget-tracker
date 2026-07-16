import { currencyCode, recordId } from '@common/lib/zod/custom-types';
import { z } from 'zod';

import { boundedImportBalance } from '../shared-schemas';

// `create-new` branch: user wants the importer to create a fresh account.
// `currencyCode` is required (auto-filled from the detected CSV currency).
// `currentBalance` is the desired post-import balance; null means "sum of imported txns".
// Bounded to the INTEGER-cents storage cap so an over-cap value fails request
// validation instead of the balance write at the end of the import job.
const createNewSchema = z.object({
  action: z.literal('create-new'),
  currencyCode: currencyCode(),
  currentBalance: boundedImportBalance({ label: 'Current balance' }).nullable(),
});

// `link-existing` branch: transactions are posted to an already-existing account.
// `accountId` must be the UUID of the target account.
const linkExistingSchema = z.object({
  action: z.literal('link-existing'),
  accountId: recordId(),
});

// Budget Bakers Wallet's `create-new` variant carries a required `currencyCode`
// (the CSV importer derives currency from the rows instead) and a required-but-nullable
// `currentBalance`, which makes it a different shape from the CSV importer's
// `accountMappingValueSchema` in `../shared-schemas`. Kept separate to preserve
// the distinct contract.
export const budgetBakersWalletAccountMappingSchema = z.record(
  z.string(),
  z.discriminatedUnion('action', [createNewSchema, linkExistingSchema]),
);
