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

/**
 * Resolves every row stamped with this `externalData.importDetails.batchId`, scoped to
 * the caller (`access: { creator: userId }` — imports are always owner-scoped, never
 * shared), then delegates to `bulkDelete` so balance recalculation, transfer-pair
 * handling, and refund unlinking all come from the same pipeline as a manual bulk
 * delete. Uses the same row-selection policy as `listBatchesHistory`'s count, so the
 * number a user confirms against before deleting matches what actually gets deleted.
 *
 * A batchId with no matching rows (already deleted, never existed, or belongs to
 * another user) resolves as a no-op success rather than a 404 — the caller only has a
 * stale batch list to act on in that situation, not a mistaken id to be corrected.
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

  // `Transactions.accountType` is a snapshot stamped at row-creation time and never
  // updated when the account is later linked to a bank — so a batch imported into a
  // manual account before it got connected still reads `accountType: system` on every
  // row. Re-check each touched account's CURRENT type here: deleting through a
  // provider-synced account would fire the normal local balance-reversal hooks while
  // the provider sync independently tracks that same balance, desyncing the two.
  // TODO: support undoing a batch whose account was later bank-linked — needs to
  // reconcile against the provider sync instead of just reversing locally.
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

  return bulkDelete({ userId, transactionIds: rows.map((row) => row.id) });
};
