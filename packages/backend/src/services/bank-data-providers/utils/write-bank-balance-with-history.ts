import { Money } from '@common/types/money';
import Accounts from '@models/accounts.model';
import Balances from '@models/balances.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { startOfDay } from 'date-fns';

/**
 * Authoritative balance writer for bank-data-provider accounts.
 *
 * Writes the bank's current balance to (a) `Accounts.currentBalance`,
 * (b) `Accounts.refCurrentBalance` (in user's base currency, via
 * `calculateRefAmount`), and (c) a `Balances` snapshot for today (overwrites
 * today's row via the race-safe `INSERT ... ON CONFLICT` path).
 *
 * Per-tx Balances backfill for historical days happens separately, inside
 * `Transactions.@AfterCreate` → `Balances.handleTransactionChange` — see the
 * two-layer design note at the top of that switch. This helper is the
 * authoritative "today" layer; the per-tx hook fills the in-between days that
 * a transaction window touches.
 *
 * PRECONDITION: `balance` MUST be denominated in `account.currencyCode`.
 * Helper does not validate — providers are responsible.
 */
export async function writeBankBalanceWithHistory({
  account,
  balance,
}: {
  account: Accounts;
  balance: Money;
}): Promise<void> {
  const today = startOfDay(new Date());

  const refBalance = await calculateRefAmount({
    amount: balance,
    userId: account.userId,
    date: today,
    baseCode: account.currencyCode,
  });

  await account.update({
    currentBalance: balance,
    refCurrentBalance: refBalance,
  });

  await Balances.updateAccountBalance({
    accountId: account.id,
    date: today,
    refBalance,
  });
}
