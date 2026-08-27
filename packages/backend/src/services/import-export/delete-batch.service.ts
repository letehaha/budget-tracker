import { ACCOUNT_TYPES } from '@bt/shared/types';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import { captureException } from '@js/utils/sentry';
import Accounts from '@models/accounts.model';
import * as Transactions from '@models/transactions.model';
import { bulkDelete } from '@services/transactions/bulk-delete';
import { Op } from 'sequelize';

interface DeleteImportBatchParams {
  userId: number;
  batchId: string;
}

interface DeleteImportBatchResult {
  deletedCount: number;
  deletedIds: string[];
}

// Import batches can reach MAX_CSV_ROWS (50k) rows; bulkDelete's one-transaction,
// per-row loop would time out at that scale.
// TODO: batches over this cap need an async BullMQ job with SSE progress instead of
// being refused outright. The Sentry capture below is the signal to prioritize it.
const MAX_BATCH_DELETE_TRANSACTIONS = 1000;

// 10 chunks at the cap, so even a 1000-row delete runs as several smaller DB
// transactions instead of one long one.
const BATCH_DELETE_CHUNK_SIZE = 100;

/**
 * Resolves every row stamped with this batch's `importDetails.batchId`, scoped to the
 * caller, then delegates to `bulkDelete` — balance recalculation, transfer-pair handling,
 * and refund unlinking all come from that same pipeline.
 *
 * A batchId with no matching rows is a no-op success, not a 404: it's already deleted or
 * belongs to another user, not a mistaken id to correct.
 */
export const deleteImportBatch = async ({
  userId,
  batchId,
}: DeleteImportBatchParams): Promise<DeleteImportBatchResult> => {
  const rows = (await Transactions.findWithFilters({
    planned: 'exclude',
    access: { creator: userId },
    completeness: 'all',
    balanceAdjustments: 'include',
    batchId,
    attributes: ['id', 'accountId'],
    isRaw: true,
  })) as unknown as { id: string; accountId: string }[];

  if (rows.length === 0) {
    return { deletedCount: 0, deletedIds: [] };
  }

  if (rows.length > MAX_BATCH_DELETE_TRANSACTIONS) {
    captureException({
      error: new Error('Import batch delete request exceeded the synchronous cap'),
      context: { userId, batchId, rowCount: rows.length, cap: MAX_BATCH_DELETE_TRANSACTIONS },
    });
    throw new ValidationError({
      message: t({ key: 'importExport.batchDeleteTooLarge' }),
    });
  }

  // `accountType` on the row is a creation-time snapshot, never updated when the account
  // later links to a bank — re-check the CURRENT type here to avoid desyncing a
  // provider-synced balance.
  // TODO: support undoing a batch whose account was later bank-linked by reconciling
  // against the provider sync instead of refusing outright.
  const accountIds = [...new Set(rows.map((row) => row.accountId))];
  const accounts = (await Accounts.findAll({
    where: { id: { [Op.in]: accountIds } },
    attributes: ['id', 'type'],
    raw: true,
  })) as unknown as { id: string; type: ACCOUNT_TYPES }[];
  const bankLinkedAccountIds = accounts.filter((account) => account.type !== ACCOUNT_TYPES.system).map((a) => a.id);

  if (bankLinkedAccountIds.length > 0) {
    captureException({
      error: new Error('Attempted to undo an import batch touching a now bank-linked account'),
      context: { userId, batchId, bankLinkedAccountIds },
    });
    throw new ValidationError({
      message: t({ key: 'importExport.batchDeleteBankLinkedAccount' }),
    });
  }

  const transactionIds = rows.map((row) => row.id);
  let deletedCount = 0;
  const deletedIds: string[] = [];
  for (let offset = 0; offset < transactionIds.length; offset += BATCH_DELETE_CHUNK_SIZE) {
    const chunkResult = await bulkDelete({
      userId,
      transactionIds: transactionIds.slice(offset, offset + BATCH_DELETE_CHUNK_SIZE),
    });
    deletedCount += chunkResult.deletedCount;
    deletedIds.push(...chunkResult.deletedIds);
  }

  return { deletedCount, deletedIds };
};
