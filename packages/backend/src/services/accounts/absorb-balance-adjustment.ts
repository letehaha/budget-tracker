import { ACCOUNT_TYPES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { ValidationError } from '@js/errors';
import Accounts, * as AccountsModel from '@models/accounts.model';
import Balances from '@models/balances.model';
import { namespace } from '@models/connection';
import { assertNotDedicatedFlowAccount } from '@services/import-export/core/dedicated-flow-guard';

import { withTransaction } from '../common/with-transaction';
import { measureSpotRefBalance } from './measure-spot-ref-balance';
import { restampRefInitialBalance } from './restamp-ref-initial-balance';

/**
 * Shift an account's balance by a signed delta while absorbing the same delta
 * into its opening balance, so `currentBalance = initialBalance + Σ(tx)` keeps
 * holding without spawning an adjustment transaction.
 *
 * Only the NATIVE delta is supplied. The ref side is derived, not delta-shifted:
 * `refCurrentBalance` is a spot measure of the shifted native balance at the
 * latest rate, and `refInitialBalance` is restamped at the ledger-boundary rate
 * (which also cascades the change into the Balances history). The abolished
 * alternative – a caller-supplied `refAmountDelta` summed from historical
 * per-row `refAmount`s – kept the opening ref balance a blend of historical
 * rates, exactly what the derived semantics replaces.
 *
 * Deltas compose: the account row is read under SELECT ... FOR UPDATE, so
 * concurrent absorbs (e.g. two imports finalizing into the same account, or an
 * import racing a bank sync that also absorbs) serialize and each applies its
 * own delta on top of the other's committed result. Writing an absolute target
 * computed from a pre-work snapshot would silently discard whatever a concurrent
 * writer added between snapshot and write.
 *
 * Non-system accounts keep their provider-owned `initialBalance`
 * / `refInitialBalance` untouched (same rule as `updateAccount`); only the
 * current balances move.
 *
 * The returned row is re-read after all derived writes, so its ref fields are
 * current.
 */
export const absorbBalanceAdjustment = withTransaction(
  async ({
    userId,
    accountId,
    amountDelta,
  }: {
    userId: number;
    accountId: string;
    /** Signed shift of `currentBalance`, in the account's own currency. */
    amountDelta: Money;
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
    const refCurrentBalance = await measureSpotRefBalance({
      userId,
      amount: newCurrentBalance,
      baseCode: account.currencyCode,
      site: 'absorbBalanceAdjustment',
    });
    const updated = await AccountsModel.updateAccountById({
      id: accountId,
      userId,
      currentBalance: newCurrentBalance,
      // A missing rate must not abort an import/bank-sync absorb: omit the ref
      // column (the stored value stays) and let the daily remeasure self-heal it.
      ...(refCurrentBalance ? { refCurrentBalance } : {}),
      ...(isSystem ? { initialBalance: account.initialBalance.add(amountDelta) } : {}),
    });
    if (!updated) {
      throw new ValidationError({ message: `Account with ID ${accountId} could not be updated` });
    }

    let result = updated;
    if (isSystem && !amountDelta.isZero()) {
      // The opening balance moved → re-derive its boundary-rate ref stamp; the
      // restamp cascades the resulting diff into the Balances history rows.
      await restampRefInitialBalance({ accountId });
      const refreshed = await Accounts.findOne({
        where: { id: accountId, userId },
        transaction: sequelizeTx,
      });
      if (refreshed) result = refreshed;
    }

    // Today's net-worth row is a stock equal to the spot `refCurrentBalance` just
    // written. Pin it last — after the restamp cascade above, which shifts today's
    // row by the opening-balance diff — so the spot value is what survives.
    await Balances.setTodayRowToSpot({ account: result });

    return result;
  },
);
