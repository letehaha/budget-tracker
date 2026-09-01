import { currencyCode, recordId } from '@common/lib/zod/custom-types';
import { z } from 'zod';

import { boundedImportBalance } from '../shared-schemas';

const createNewSchema = z.object({
  action: z.literal('create-new'),
  name: z.string().trim().min(1).max(255),
  currencyCode: currencyCode(),
  currentBalance: boundedImportBalance({ label: 'Current balance' }).nullable(),
});

const linkExistingSchema = z.object({ action: z.literal('link-existing'), accountId: recordId() });
const skipSchema = z.object({ action: z.literal('skip') });

export const ofxAccountMappingSchema = z.record(
  z.string(),
  z.discriminatedUnion('action', [createNewSchema, linkExistingSchema, skipSchema]),
);

export const ofxUploadIdSchema = z.uuid();
