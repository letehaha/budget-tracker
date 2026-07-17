import * as UserExchangeRates from '@models/user-exchange-rates.model';
import { remeasureRefBalances } from '@services/accounts/remeasure-ref-balances';

import { withTransaction } from '../common/with-transaction';

export const editUserExchangeRates = withTransaction(
  async ({ userId, pairs }: { userId: number; pairs: UserExchangeRates.UpdateExchangeRatePair[] }) => {
    const rates = await UserExchangeRates.updateRates({
      userId,
      pairs,
    });

    // A custom rate changes what this user's balances are worth in their base
    // currency — the stored spot measures must observe it immediately, not at the
    // next daily rate sync.
    await remeasureRefBalances({ userId });

    return rates;
  },
);
