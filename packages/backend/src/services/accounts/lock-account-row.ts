import { removeUndefinedKeys } from '@js/helpers';
import Accounts from '@models/accounts.model';
import { namespace } from '@models/connection';

/**
 * Reads an account row under a row lock inside the ambient CLS transaction so a
 * read-modify-write of its balance serializes against concurrent writers.
 *
 * `noKey` picks FOR NO KEY UPDATE. Use it from paths that run after a row
 * referencing the account was inserted in the same request: that insert already
 * holds FOR KEY SHARE on the account through its foreign key, and FOR UPDATE
 * conflicts with it, so two concurrent inserts would deadlock each other.
 */
export const lockAccountRow = async ({
  accountId,
  userId,
  noKey = false,
}: {
  accountId: string;
  userId?: number;
  noKey?: boolean;
}): Promise<Accounts | null> => {
  const sequelizeTx = namespace.get('transaction');
  return Accounts.findOne({
    where: removeUndefinedKeys({ id: accountId, userId }),
    transaction: sequelizeTx,
    lock: noKey ? sequelizeTx?.LOCK.NO_KEY_UPDATE : sequelizeTx?.LOCK.UPDATE,
  });
};
