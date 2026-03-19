import * as UserExchangeRates from '@models/user-exchange-rates.model';

import { withTransaction } from '../common/with-transaction';

export const editUserExchangeRates = withTransaction(
  async ({ userId, pairs }: { userId: number; pairs: UserExchangeRates.UpdateExchangeRatePair[] }) => {
    return UserExchangeRates.updateRates({
      userId,
      pairs,
    });
  },
);
