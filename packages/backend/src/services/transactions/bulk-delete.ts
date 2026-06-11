import { ACCOUNT_TYPES } from '@bt/shared/types';
import { t } from '@i18n/index';
import { NotFoundError, ValidationError } from '@js/errors';
import * as Transactions from '@models/transactions.model';
import { Op } from 'sequelize';

import { withTransaction } from '../common/with-transaction';
import { deleteTransaction } from './delete-transaction';

interface BulkDeleteParams {
  userId: number;
  transactionIds: string[];
}

interface BulkDeleteResult {
  deletedCount: number;
  deletedIds: string[];
}

/**
 * Deletes a set of transactions in a single DB transaction (all-or-nothing).
 *
 * Bank-connected rows (accountType !== system) are rejected up-front with a
 * structured error listing the offending ids — the API must enforce this
 * regardless of what the client sends, since external transactions are owned
 * by the bank sync and deleting them would desync balances on the next sync.
 *
 * Each row goes through `deleteTransaction`, which handles per-row write
 * authorization, transfer-pair cleanup, refund unlinking, and portfolio
 * transfer reversal. When a common-transfer leg is deleted its twin goes with
 * it, so a twin that was also selected is skipped instead of failing with 404.
 */
const bulkDeleteImpl = async ({ userId, transactionIds }: BulkDeleteParams): Promise<BulkDeleteResult> => {
  const uniqueIds = [...new Set(transactionIds)];

  const rows = (await Transactions.default.findAll({
    where: { id: { [Op.in]: uniqueIds }, userId },
    attributes: ['id', 'accountType', 'transferId'],
    raw: true,
  })) as unknown as Array<{ id: string; accountType: ACCOUNT_TYPES; transferId: string | null }>;

  if (rows.length === 0) {
    throw new NotFoundError({ message: 'No valid transactions found' });
  }

  const disallowedIds = rows.filter((row) => row.accountType !== ACCOUNT_TYPES.system).map((row) => row.id);
  if (disallowedIds.length > 0) {
    throw new ValidationError({
      message: t({ key: 'transactions.cannotDeleteExternal' }),
      details: { disallowedIds },
    });
  }

  const deletedIds: string[] = [];
  const deletedTransferIds = new Set<string>();

  for (const row of rows) {
    if (row.transferId && deletedTransferIds.has(row.transferId)) continue;

    await deleteTransaction({ id: row.id, userId });
    deletedIds.push(row.id);

    if (row.transferId) deletedTransferIds.add(row.transferId);
  }

  return { deletedCount: deletedIds.length, deletedIds };
};

export const bulkDelete = withTransaction(bulkDeleteImpl);
