import * as UserExchangeRates from '@models/user-exchange-rates.model';
import { remeasureRefBalances } from '@services/accounts/remeasure-ref-balances';

import { withTransaction } from '../common/with-transaction';

export const removeUserExchangeRates = withTransaction(
  async ({ userId, pairs }: { userId: number; pairs: UserExchangeRates.ExchangeRatePair[] }) => {
    const result = await UserExchangeRates.removeRates({
      userId,
      pairs,
    });

    // Dropping a custom rate reverts this user to market rates — re-anchor the
    // stored spot measures to those immediately.
    await remeasureRefBalances({ userId });

    return result;
  },
);
