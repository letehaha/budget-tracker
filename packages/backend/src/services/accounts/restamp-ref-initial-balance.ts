import { ACCOUNT_CATEGORIES, ACCOUNT_TYPES } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import Accounts from '@models/accounts.model';
import Balances from '@models/balances.model';
import Transactions from '@models/transactions.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { Op } from 'sequelize';

import { withTransaction } from '../common/with-transaction';

/**
 * 'failed' keeps the previous stamp: hook callers tolerate it (a missing rate
 * must not fail a transaction write); callers that just rewrote
 * `initialBalance` must not.
 */
type RestampOutcome = 'restamped' | 'unchanged' | 'skipped' | 'failed';

/**
 * Re-stamps `refInitialBalance` at the exchange rate of the ledger boundary:
 * the date immediately before the account's earliest transaction (now, when
 * there are none). Stamping at any other date mixes a foreign rate into a
 * ledger whose transactions each carry their own historical rate. Scope:
 * system accounts minus loans and vehicles, whose stamps are owned by their
 * dedicated flows.
 */
async function restampRefInitialBalanceImpl({
  accountId,
  excludeTransactionId,
  allowProviderAccount = false,
}: {
  accountId: string;
  /**
   * A row excluded from the boundary — the tx being removed when this runs from a
   * BeforeDestroy hook, where it still exists.
   */
  excludeTransactionId?: string;
  /**
   * Opts a bank-provider account in, for a caller that deliberately rewrote
   * `initialBalance` and therefore owns the ref stamp too.
   */
  allowProviderAccount?: boolean;
}): Promise<RestampOutcome> {
  const account = await Accounts.findOne({ where: { id: accountId } });
  if (!account) return 'skipped';
  if (
    (account.type !== ACCOUNT_TYPES.system && !allowProviderAccount) ||
    account.accountCategory === ACCOUNT_CATEGORIES.loan ||
    account.accountCategory === ACCOUNT_CATEGORIES.vehicle
  ) {
    return 'skipped';
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
    return 'failed';
  }

  if (refInitialBalance.equals(account.refInitialBalance)) return 'unchanged';

  await Accounts.update({ refInitialBalance }, { where: { id: accountId } });

  // The Balances history is seeded from `refInitialBalance`; a moved opening
  // stamp re-baselines every row, which `handleAccountChange` cascades.
  const updated = await Accounts.findOne({ where: { id: accountId } });
  if (updated) {
    await Balances.handleAccountChange({ account: updated, prevAccount: account });
  } else {
    // Impossible state: the row was updated above. The stamp persisted but the
    // history cascade is skipped, so the chart diverges until the next rebuild.
    logger.error(
      {
        message:
          'restampRefInitialBalance: refInitialBalance written but account re-read missed; Balances history cascade skipped',
      },
      { code: 'ACCOUNT_REF_INITIAL_RESTAMP_REREAD_MISSED', accountId, userId: account.userId },
    );
  }
  return 'restamped';
}

export const restampRefInitialBalance = withTransaction(restampRefInitialBalanceImpl);
