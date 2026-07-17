import { Money } from '@common/types/money';
import { logger } from '@js/utils/logger';
import Accounts from '@models/accounts.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';

/**
 * Re-anchors the base-currency (`ref*`) side of account balances to the latest
 * exchange rate.
 *
 * `refCurrentBalance` and `refCreditLimit` are spot measures — "what is this
 * account's native value worth in the owner's base currency right now". They are
 * NOT accumulators of per-transaction conversions: transaction `refAmount`s keep
 * their historical tx-date rates (flows), while account-level ref balances are
 * stocks that must track the current rate. Without this re-anchoring, a rate move
 * leaves every stored ref balance at a blend of historical rates — most visibly,
 * an account whose native balance returns to zero keeps a nonzero base-currency
 * residue.
 *
 * Runs after every exchange-rate sync (all accounts) and after a user edits or
 * removes a custom rate (that user's accounts only).
 *
 * Deliberately NOT wrapped in `withTransaction` at this level: from the daily
 * cron this iterates every account in the system, and one long transaction would
 * hold locks across all of them while a single failed conversion rolled back the
 * rest. Each account is converted and written independently; failures are logged
 * and skipped. When called from an already-transactional flow (custom-rate edit),
 * the per-account queries join that ambient transaction via CLS as usual.
 */
export async function remeasureRefBalances({ userId }: { userId?: number } = {}): Promise<{
  updated: number;
  failed: number;
}> {
  const accounts = await Accounts.findAll({
    where: userId === undefined ? {} : { userId },
  });

  let updated = 0;
  let failed = 0;

  for (const account of accounts) {
    try {
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
        continue;
      }

      await Accounts.update({ refCurrentBalance, refCreditLimit }, { where: { id: account.id } });
      updated += 1;
    } catch (e) {
      // A single account with an unavailable rate (exotic currency, provider gap)
      // must not block remeasuring the rest — its previous ref values stay in
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
