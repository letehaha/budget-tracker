import * as UsersCurrencies from '@models/users-currencies.model';
import { withTransaction } from '@services/common/with-transaction';

/**
 * Idempotently ensure that `currencyCode` is connected to the user. Used on the
 * shared-account write path: when a recipient writes a transaction on an account
 * whose currency they haven't connected (different from their base currency),
 * the downstream ref-amount lookup would otherwise throw `currencyNotConnected`.
 * Auto-connecting under the hood keeps that error from surfacing to the user.
 *
 * Runs inside the surrounding `withTransaction` context so the insert rolls back
 * with the rest of the write on failure.
 */
export const ensureUserCurrencyConnected = withTransaction(
  async ({ userId, currencyCode }: { userId: number; currencyCode: string }) => {
    await UsersCurrencies.addCurrency({ userId, currencyCode });
  },
);
