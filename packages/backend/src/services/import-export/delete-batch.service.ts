import { ACCOUNT_TYPES, TRANSACTION_TRANSFER_NATURE, isTwoLegTransfer } from '@bt/shared/types';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import { captureException } from '@js/utils/sentry';
import Accounts from '@models/accounts.model';
import { findTransactions, updateTransactions } from '@models/transactions-query';
import * as Transactions from '@models/transactions.model';
import { withTransaction } from '@services/common/with-transaction';
import { bulkDelete } from '@services/transactions/bulk-delete';
import { Op } from 'sequelize';

interface DeleteImportBatchParams {
  userId: number;
  batchId: string;
  /** Explicit opt-in to hard-delete a transfer's other leg when it lies outside the
   *  batch (a pre-existing manual transaction the import got linked to). Default
   *  `false` unlinks the batch's own leg to `transfer_out_wallet` instead, leaving the
   *  external transaction untouched. */
  deleteLinkedTransfers?: boolean;
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

/**
 * Resolves every row stamped with this batch's `importDetails.batchId`, scoped to the
 * caller, then delegates to `bulkDelete` — balance recalculation, transfer-pair handling,
 * and refund unlinking all come from that same pipeline. The whole undo runs in one DB
 * transaction, so a mid-run failure rolls back every delete and unlink.
 *
 * A batchId with no matching rows is a no-op success, not a 404: it's already deleted or
 * belongs to another user, not a mistaken id to correct.
 */
const deleteImportBatchImpl = async ({
  userId,
  batchId,
  deleteLinkedTransfers = false,
}: DeleteImportBatchParams): Promise<DeleteImportBatchResult> => {
  const rows = (await Transactions.findWithFilters({
    planned: 'exclude',
    access: { creator: userId },
    completeness: 'all',
    balanceAdjustments: 'include',
    batchId,
    attributes: ['id', 'accountId', 'transferId', 'transferNature'],
    isRaw: true,
  })) as unknown as {
    id: string;
    accountId: string;
    transferId: string | null;
    transferNature: TRANSACTION_TRANSFER_NATURE;
  }[];

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

  // `deleteTransaction` cascade-deletes BOTH legs of a transfer unconditionally — a batch
  // row linked to a pre-existing manual transaction would silently destroy it too, uncounted.
  // Transfers created entirely within this batch (both legs present) are exempt: their
  // normal cascade-delete-together destroys nothing external.
  const transactionIds = rows.map((row) => row.id);
  const batchRowIds = new Set(transactionIds);
  const linkedLegs = rows.filter((row) => isTwoLegTransfer(row.transferNature) && row.transferId);

  let externalTwinIds: string[] = [];
  let legsWithExternalTwin: typeof linkedLegs = [];
  if (linkedLegs.length > 0) {
    // Unauthenticated on purpose, mirroring `deleteTransaction`'s own cascade lookup: a
    // cross-user (shared-account) transfer's twin can belong to a different userId.
    const transferIds = [...new Set(linkedLegs.map((row) => row.transferId!))];
    const twins = (await findTransactions({
      planned: 'include',
      access: 'unscoped-internal',
      balanceAdjustments: 'include',
      completeness: 'all',
      where: { transferId: { [Op.in]: transferIds } },
      attributes: ['id', 'transferId'],
      raw: true,
    })) as unknown as { id: string; transferId: string }[];

    const externalTwins = twins.filter((twin) => !batchRowIds.has(twin.id));
    const transferIdsWithExternalTwin = new Set(externalTwins.map((twin) => twin.transferId));
    externalTwinIds = externalTwins.map((twin) => twin.id);
    legsWithExternalTwin = linkedLegs.filter((row) => transferIdsWithExternalTwin.has(row.transferId!));
  }

  if (externalTwinIds.length > 0 && !deleteLinkedTransfers) {
    // A loan leg has no unlink path (see `unlinkTransferTransactions`) — the twin can
    // only go away by being deleted, which the caller hasn't opted into.
    const hasLoanLeg = legsWithExternalTwin.some(
      (row) => row.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
    );
    if (hasLoanLeg) {
      throw new ValidationError({
        message: t({ key: 'importExport.batchDeleteLinkedLoanTransfer' }),
      });
    }

    // Unlink BOTH legs (mirrors `unlinkTransferTransactions`) so the surviving external
    // twin lands as a clean standalone row, not a two-leg transfer with no partner.
    // `access: 'unscoped-internal'` matches `deleteTransaction`'s own cascade branch — the
    // twin may belong to a different user on a shared account. No balance impact:
    // `updateTransactions` skips per-instance hooks and the money movement is unchanged.
    await updateTransactions({
      planned: 'exclude',
      access: 'unscoped-internal',
      balanceAdjustments: 'include',
      values: { transferId: null, transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet },
      where: {
        transferId: { [Op.in]: [...new Set(legsWithExternalTwin.map((row) => row.transferId!))] },
      },
    });
  }

  // Never chunk this list: `bulkDelete` skips a cascade-deleted transfer twin only
  // within one call. A twin in a later chunk gets re-queried after deletion and 404s.
  await bulkDelete({ userId, transactionIds });

  // `bulkDelete`'s result omits cascade-deleted twins. Once it returns, every batch row
  // plus the opted-in twins is gone, so report the full list.
  const deletedIds = deleteLinkedTransfers ? [...transactionIds, ...externalTwinIds] : transactionIds;
  return { deletedCount: deletedIds.length, deletedIds };
};

export const deleteImportBatch = withTransaction(deleteImportBatchImpl);
