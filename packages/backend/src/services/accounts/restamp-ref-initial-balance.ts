import { ACCOUNT_CATEGORIES, ACCOUNT_TYPES } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import Accounts from '@models/accounts.model';
import Balances from '@models/balances.model';
import Transactions from '@models/transactions.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { Op } from 'sequelize';

import { withTransaction } from '../common/with-transaction';

/**
 * Re-stamps `refInitialBalance` at the exchange rate of the account's ledger
 * boundary — the date the opening balance actually existed.
 *
 * For a tx-backed system account, `initialBalance` is by definition the balance
 * immediately BEFORE the earliest transaction, so its base-currency value must
 * use the rate at that earliest-transaction date. Converting it at whatever day
 * the account row happened to be created (e.g. the day of an import of years-old
 * history) mixes an import-day rate into a ledger whose every transaction uses
 * its own historical rate.
 *
 * The boundary moves whenever a transaction older than all existing ones is
 * added, or the earliest transaction is deleted/re-dated — so this runs from the
 * same per-transaction balance hook that maintains `currentBalance`. With no
 * transactions there is no ledger boundary: the opening balance is treated as
 * current-dated and stamped at the latest rate — the same rule account creation
 * applies (`Accounts` has no timestamps, so a creation date does not exist to
 * anchor on).
 *
 * Scope: system accounts, excluding loans and vehicles. Bank-provider accounts
 * keep their provider-owned opening snapshot (stamped when the connection was
 * made); a loan's `refInitialBalance` is its balance-anchor value, deliberately
 * stamped at re-anchor time by `updateLoan`; a vehicle's opening is its purchase
 * value with no backing transactions to define a ledger boundary.
 */
async function restampRefInitialBalanceImpl({
  accountId,
  excludeTransactionId,
}: {
  accountId: string;
  /**
   * A transaction row that must not count toward the boundary — the row being
   * removed when this runs from a BeforeDestroy hook, where it still exists.
   */
  excludeTransactionId?: string;
}): Promise<void> {
  const account = await Accounts.findOne({ where: { id: accountId } });
  if (!account) return;
  if (
    account.type !== ACCOUNT_TYPES.system ||
    account.accountCategory === ACCOUNT_CATEGORIES.loan ||
    account.accountCategory === ACCOUNT_CATEGORIES.vehicle
  ) {
    return;
  }

  const earliestTxTime = (await Transactions.min('time', {
    where: {
      accountId,
      ...(excludeTransactionId ? { id: { [Op.ne]: excludeTransactionId } } : {}),
    },
  })) as Date | null;

  const boundaryDate = earliestTxTime ?? new Date();

  let refInitialBalance;
  try {
    refInitialBalance = await calculateRefAmount({
      userId: account.userId,
      amount: account.initialBalance,
      baseCode: account.currencyCode,
      date: boundaryDate,
    });
  } catch (e) {
    // No rate reaches back to the boundary date for this pair — keep the current
    // stamp rather than failing the transaction write that triggered the restamp.
    logger.error(
      {
        message: 'Failed to restamp refInitialBalance at ledger boundary; previous value kept',
        error: e as Error,
      },
      { code: 'ACCOUNT_REF_INITIAL_RESTAMP_FAILED', accountId, userId: account.userId },
    );
    return;
  }

  if (refInitialBalance.equals(account.refInitialBalance)) return;

  await Accounts.update({ refInitialBalance }, { where: { id: accountId } });

  // The Balances history is seeded from `refInitialBalance` and every row builds
  // on that seed — an opening re-stamp re-baselines the whole history, which
  // `handleAccountChange` does by cascading the diff into every row.
  const updated = await Accounts.findOne({ where: { id: accountId } });
  if (updated) {
    await Balances.handleAccountChange({ account: updated, prevAccount: account });
  }
}

export const restampRefInitialBalance = withTransaction(restampRefInitialBalanceImpl);
