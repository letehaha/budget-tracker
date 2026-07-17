import { ACCOUNT_TYPES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { ValidationError } from '@js/errors';
import Accounts, * as AccountsModel from '@models/accounts.model';
import Balances from '@models/balances.model';
import { namespace } from '@models/connection';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { assertNotDedicatedFlowAccount } from '@services/import-export/core/dedicated-flow-guard';

import { withTransaction } from '../common/with-transaction';

/**
 * Shift an account's balance by a signed delta while absorbing the same delta
 * into its opening balance, so `currentBalance = initialBalance + Σ(tx)` keeps
 * holding without spawning an adjustment transaction.
 *
 * The ref side splits by role: `refCurrentBalance` is a spot measure and is
 * re-derived from the shifted native balance at the latest rate (never
 * delta-adjusted — the stored value blends historical rates). The OPENING ref
 * balance still moves by the caller-supplied `refAmountDelta` — callers that
 * undo transaction effects must pass the sum of those rows' actual
 * `refAmount`s (historical FX rates), so the opening ledger anchor and the
 * Balances-history cascade stay consistent with the per-transaction rates.
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
    /**
     * Signed shift of the opening `refInitialBalance` (system accounts only), in
     * the owner's base currency — the sum of the undone rows' historical
     * `refAmount`s. `refCurrentBalance` is NOT delta-shifted; it is re-derived
     * from the new native balance at the latest rate.
     */
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
    const newCurrentBalance = account.currentBalance.add(amountDelta);
    const refCurrentBalance = await calculateRefAmount({
      userId,
      amount: newCurrentBalance,
      baseCode: account.currencyCode,
      date: new Date(),
      bypassCache: true,
    });
    const updated = await AccountsModel.updateAccountById({
      id: accountId,
      userId,
      currentBalance: newCurrentBalance,
      refCurrentBalance,
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
