import { RefBalanceRemeasureResult } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { logger } from '@js/utils/logger';
import Accounts from '@models/accounts.model';
import Balances from '@models/balances.model';
import { namespace } from '@models/connection';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { withTransaction } from '@services/common/with-transaction';
import { DatabaseError } from 'sequelize';

/**
 * Re-measures a single account's spot `ref*` balances at the latest rate and pins
 * today's net-worth row to match. Returns `'updated'` when the values moved (and
 * were written), `'skipped'` when they were already current.
 *
 * Wrapped in `withTransaction` so its two writes (the account row and the today
 * `Balances` row) commit together:
 *  - On the daily cron there is no ambient transaction, so this opens its OWN
 *    per-account transaction. The two writes are then atomic — a throw after the
 *    account write rolls both back, so the caller's "previous values kept" log is
 *    truthful instead of leaving a half-applied write the equals-guard would treat
 *    as up-to-date forever. Scoping the transaction to one account (rather than
 *    wrapping the whole cron sweep) keeps a single failed conversion from holding
 *    locks across every account or rolling back the rest.
 *  - Inside the custom-rate edit/remove flow there IS an ambient transaction, so
 *    this reuses it (no nesting). The custom rate was written earlier in that same
 *    transaction and is still uncommitted, so the reads below must run in it to
 *    observe it — a nested transaction here would read the pre-edit committed rate
 *    and re-anchor balances to stale FX.
 */
const remeasureAccountRefBalances = withTransaction(
  async ({ account }: { account: Accounts }): Promise<'skipped' | 'updated'> => {
    const refCurrentBalance = await calculateRefAmount({
      // Account owner, not the caller: ref balances are stored in the OWNER's
      // base currency, and rate resolution (connected-currency check, custom
      // rates) must run against the owner.
      userId: account.userId,
      amount: account.currentBalance,
      baseCode: account.currencyCode,
      date: new Date(),
      bypassCache: true,
    });
    const refCreditLimit = account.creditLimit.isZero()
      ? Money.zero()
      : await calculateRefAmount({
          userId: account.userId,
          amount: account.creditLimit,
          baseCode: account.currencyCode,
          date: new Date(),
          bypassCache: true,
        });

    if (refCurrentBalance.equals(account.refCurrentBalance) && refCreditLimit.equals(account.refCreditLimit)) {
      return 'skipped';
    }

    await Accounts.update({ refCurrentBalance, refCreditLimit }, { where: { id: account.id } });

    // The chart's today point is a stock too: re-anchor it alongside the account
    // card by pinning today's net-worth row to the freshly measured spot value.
    account.refCurrentBalance = refCurrentBalance;
    await Balances.setTodayRowToSpot({ account });
    return 'updated';
  },
);

/**
 * Re-anchors the base-currency (`ref*`) side of account balances to the latest
 * exchange rate.
 *
 * `refCurrentBalance` and `refCreditLimit` are spot measures – "what is this
 * account's native value worth in the owner's base currency right now". They are
 * NOT accumulators of per-transaction conversions: transaction `refAmount`s keep
 * their historical tx-date rates (flows), while account-level ref balances are
 * stocks that must track the current rate. Without this re-anchoring, a rate move
 * leaves every stored ref balance at a blend of historical rates – most visibly,
 * an account whose native balance returns to zero keeps a nonzero base-currency
 * residue.
 *
 * Runs after every exchange-rate sync (all accounts) and after a user edits or
 * removes a custom rate (that user's accounts only). There is no single long
 * transaction spanning all accounts — each account is re-measured independently
 * via `remeasureAccountRefBalances` (see its per-account transaction semantics),
 * and a per-account failure is counted and logged so the rest still proceed.
 *
 * The per-account catch is ASYMMETRIC by path, because a swallowed error means
 * different things depending on whether an ambient transaction is present:
 *  - Custom-rate edit/remove path (ambient transaction present): a DB statement
 *    error aborts the whole ambient Postgres transaction ("current transaction is
 *    aborted", 25P02) — every later per-account query then fails the same way, and
 *    the wrapping `withTransaction`'s COMMIT silently becomes a ROLLBACK. Swallowing
 *    it would let the endpoint return 200 for a request whose rate write never
 *    persisted. So a `sequelize.DatabaseError` on this path is RE-THROWN: it
 *    propagates to `withTransaction` → rollback → the endpoint fails honestly and
 *    the user retries. (A savepoint would scope the abort instead, but it can't be
 *    used here — see `remeasureAccountRefBalances`.)
 *  - Cron path (no ambient transaction): each account has its own transaction that
 *    already rolled back cleanly on failure, so there is nothing to poison — count
 *    it and continue.
 * The designed missing-rate failure (exotic currency, provider gap) is a custom app
 * error, NOT a `DatabaseError`, so it always counts-and-continues on both paths.
 */
export async function remeasureRefBalances({ userId }: { userId?: number } = {}): Promise<RefBalanceRemeasureResult> {
  const accounts = await Accounts.findAll({
    where: userId === undefined ? {} : { userId },
  });

  // Captured once at entry: an ambient transaction here means the caller
  // (custom-rate edit/remove) wraps this whole sweep, so a DB abort below poisons
  // that shared transaction. On the cron there is none.
  const ambientTransaction = namespace.get('transaction');
  const hasAmbientTransaction = !!ambientTransaction && !ambientTransaction.finished;

  let updated = 0;
  let failed = 0;

  for (const account of accounts) {
    try {
      const status = await remeasureAccountRefBalances({ account });
      if (status === 'updated') updated += 1;
    } catch (e) {
      // A DB statement error inside the caller's ambient transaction has already
      // aborted it — continuing would count phantom "current transaction is aborted"
      // failures and let the endpoint COMMIT-turned-ROLLBACK drop the rate write
      // silently. Re-throw so the whole request rolls back and fails honestly.
      if (hasAmbientTransaction && e instanceof DatabaseError) {
        throw e;
      }

      // A single account with an unavailable rate (exotic currency, provider gap)
      // must not block remeasuring the rest – its previous ref values stay in
      // place until a later run finds a rate.
      failed += 1;
      logger.error(
        {
          message: 'Failed to remeasure ref balances for account; previous values kept',
          error: e as Error,
        },
        { code: 'ACCOUNT_REF_REMEASURE_FAILED', accountId: account.id, userId: account.userId },
      );
    }
  }

  return { updated, failed };
}
