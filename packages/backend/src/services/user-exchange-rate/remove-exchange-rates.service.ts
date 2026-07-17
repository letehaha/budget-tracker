import * as UserExchangeRates from '@models/user-exchange-rates.model';
import { remeasureRefBalances } from '@services/accounts/remeasure-ref-balances';

import { withTransaction } from '../common/with-transaction';

export const removeUserExchangeRates = withTransaction(
  async ({ userId, pairs }: { userId: number; pairs: UserExchangeRates.ExchangeRatePair[] }) => {
    await UserExchangeRates.removeRates({
      userId,
      pairs,
    });

    // Dropping a custom rate reverts this user to market rates — re-anchor the
    // stored spot measures to those immediately.
    //
    // A per-account remeasure failure (no market rate for the reverted pair yet)
    // keeps that account's stale value rather than rolling back the removal, which
    // committed correctly. Return the counts so the caller can warn the user; the
    // daily sync re-anchors the lagging balances once a rate exists.
    const remeasure = await remeasureRefBalances({ userId });

    return { remeasure };
  },
);
