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
 * For a tx-backed system account, `initialBalance` is the balance immediately
 * BEFORE the earliest transaction, so its base-currency value uses that date's
 * rate. Converting at the account's creation date instead (e.g. an import of
 * years-old history) mixes an import-day rate into a ledger whose transactions
 * each carry their own historical rate.
 *
 * The boundary moves whenever a transaction older than all existing ones is added
 * or the earliest is deleted/re-dated, so this runs from the per-transaction
 * balance hook. With no transactions there is no boundary: the opening balance is
 * stamped at the latest rate, matching account creation.
 *
 * Scope: system accounts, excluding loans and vehicles. Bank-provider accounts
 * keep their provider-owned opening snapshot, a loan's `refInitialBalance` is its
 * balance-anchor value stamped by `updateLoan`, and a vehicle's opening is its
 * purchase value with no transactions to define a boundary.
 */
async function restampRefInitialBalanceImpl({
  accountId,
  excludeTransactionId,
}: {
  accountId: string;
  /**
   * A row excluded from the boundary — the tx being removed when this runs from a
   * BeforeDestroy hook, where it still exists.
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

  // The Balances history is seeded from `refInitialBalance`; a moved opening
  // stamp re-baselines every row, which `handleAccountChange` cascades.
  const updated = await Accounts.findOne({ where: { id: accountId } });
  if (updated) {
    await Balances.handleAccountChange({ account: updated, prevAccount: account });
  } else {
    // The row was just updated above, so a miss is an impossible-state (concurrent
    // delete / id drift). `refInitialBalance` persisted but the history cascade is
    // skipped — the chart diverges from the new stamp until the next full rebuild.
    logger.error(
      {
        message:
          'restampRefInitialBalance: refInitialBalance written but account re-read missed; Balances history cascade skipped',
      },
      { code: 'ACCOUNT_REF_INITIAL_RESTAMP_REREAD_MISSED', accountId, userId: account.userId },
    );
  }
}

export const restampRefInitialBalance = withTransaction(restampRefInitialBalanceImpl);
