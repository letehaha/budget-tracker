import * as UsersCurrencies from '@models/users-currencies.model';
import { withTransaction } from '@services/common/with-transaction';

/**
 * Idempotently ensure that `currencyCode` is connected to the user and return
 * the connected UsersCurrencies row (existing or freshly created). Service-level
 * entry point for the "currency not connected → connect it mid-flow" pattern.
 *
 * On the shared-account write path this prevents a recipient who writes a
 * transaction on an account whose currency they haven't connected (different
 * from their base currency) from hitting `currencyNotConnected` in the
 * downstream ref-amount lookup. Runs inside the surrounding `withTransaction`
 * context so the insert rolls back with the rest of the write on failure.
 *
 * NOTE: UsersCurrencies has no UNIQUE(userId, currencyCode) index, so
 * insert-or-adopt via savepoint (see run-in-savepoint.ts) would catch nothing
 * here — find-or-create (UsersCurrencies.addCurrency) is the contract.
 */
export const ensureUserCurrencyConnected = withTransaction(
  ({ userId, currencyCode }: { userId: number; currencyCode: string }) =>
    UsersCurrencies.addCurrency({ userId, currencyCode }),
);
