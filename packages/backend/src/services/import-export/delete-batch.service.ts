import * as Transactions from '@models/transactions.model';
import { bulkDelete } from '@services/transactions/bulk-delete';

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
    attributes: ['id'],
    isRaw: true,
  })) as unknown as { id: string }[];

  if (rows.length === 0) {
    return { deletedCount: 0, deletedIds: [] };
  }

  return bulkDelete({ userId, transactionIds: rows.map((row) => row.id) });
};
