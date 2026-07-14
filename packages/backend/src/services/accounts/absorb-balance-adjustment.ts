import { ACCOUNT_TYPES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { ValidationError } from '@js/errors';
import Accounts, * as AccountsModel from '@models/accounts.model';
import Balances from '@models/balances.model';
import { namespace } from '@models/connection';
import { assertNotDedicatedFlowAccount } from '@services/import-export/core/dedicated-flow-guard';

import { withTransaction } from '../common/with-transaction';

/**
 * Shift an account's balance by a signed delta while absorbing the same delta
 * into its opening balance, so `currentBalance = initialBalance + Σ(tx)` keeps
 * holding without spawning an adjustment transaction. The ref side moves by its
 * own caller-supplied delta — callers that undo transaction effects must pass
 * the sum of those rows' actual `refAmount`s (historical FX rates), never a
 * today-rate conversion of `amountDelta`, or the base-currency balance drifts
 * by the FX difference.
 *
 * Deltas compose: the account row is read under SELECT ... FOR UPDATE, so
 * concurrent absorbs (e.g. two imports finalizing into the same account, or an
 * import racing a bank sync that also absorbs) serialize and each applies its
 * own delta on top of the other's committed result. The abolished alternative —
 * writing an absolute target computed from a pre-work snapshot — silently
 * discards whatever a concurrent writer added between snapshot and write.
 *
 * Non-system accounts keep their provider-owned `initialBalance`
 * / `refInitialBalance` untouched (same rule as `updateAccount`); only the
 * current balances move.
 */
export const absorbBalanceAdjustment = withTransaction(
  async ({
    userId,
    accountId,
    amountDelta,
    refAmountDelta,
  }: {
    userId: number;
    accountId: string;
    /** Signed shift of `currentBalance`, in the account's own currency. */
    amountDelta: Money;
    /** Signed shift of `refCurrentBalance`, in the user's base currency. */
    refAmountDelta: Money;
  }): Promise<Accounts> => {
    const sequelizeTx = namespace.get('transaction');
    const account = await Accounts.findOne({
      where: { id: accountId, userId },
      transaction: sequelizeTx,
      lock: sequelizeTx?.LOCK.UPDATE,
    });
    if (!account) {
      throw new ValidationError({ message: `Account with ID ${accountId} not found` });
    }
    assertNotDedicatedFlowAccount({ account, actionPhrase: 'take a balance adjustment' });

    const isSystem = account.type === ACCOUNT_TYPES.system;
    const updated = await AccountsModel.updateAccountById({
      id: accountId,
      userId,
      currentBalance: account.currentBalance.add(amountDelta),
      refCurrentBalance: account.refCurrentBalance.add(refAmountDelta),
      ...(isSystem
        ? {
            initialBalance: account.initialBalance.add(amountDelta),
            refInitialBalance: account.refInitialBalance.add(refAmountDelta),
          }
        : {}),
    });
    if (!updated) {
      throw new ValidationError({ message: `Account with ID ${accountId} could not be updated` });
    }

    // An opening-balance change re-baselines the whole Balances history for the
    // account; `handleAccountChange` cascades the `refInitialBalance` diff into
    // every history row. Nothing to cascade when the ref opening balance did
    // not move (non-system accounts, or a zero ref delta).
    if (isSystem && !refAmountDelta.isZero()) {
      await Balances.handleAccountChange({ account: updated, prevAccount: account });
    }

    return updated;
  },
);
