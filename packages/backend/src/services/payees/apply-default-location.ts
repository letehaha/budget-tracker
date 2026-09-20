import type { TransactionLocation } from '@bt/shared/types';
import Payees from '@models/payees.model';
import { updateTransactions } from '@models/transactions-query';

import { withTransaction } from '../common/with-transaction';

interface ApplyPayeeDefaultLocationParams {
  /** Owner of the account the row lives on; scopes the Payee lookup. Caller has authorized the write. */
  accountOwnerUserId: number;
  transactionId: string;
  payeeId: string;
}

/**
 * Stamp a Payee's default location onto a transaction that has none.
 * Returns the applied location, or null when the Payee has no default or the row already carries one.
 */
export const applyPayeeDefaultLocation = withTransaction(
  async ({
    accountOwnerUserId,
    transactionId,
    payeeId,
  }: ApplyPayeeDefaultLocationParams): Promise<TransactionLocation | null> => {
    const payee = await Payees.findOne({
      where: { id: payeeId, userId: accountOwnerUserId },
      attributes: ['defaultLocation'],
    });
    if (!payee?.defaultLocation) return null;

    const [affected] = await updateTransactions({
      values: { location: payee.defaultLocation },
      planned: 'include',
      access: 'unscoped-internal',
      balanceAdjustments: 'include',
      where: { id: transactionId, location: null },
    });
    return affected > 0 ? payee.defaultLocation : null;
  },
);
