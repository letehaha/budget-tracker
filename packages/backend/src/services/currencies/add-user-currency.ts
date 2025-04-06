import { ValidationError } from '@js/errors';
import * as UsersCurrencies from '@models/UsersCurrencies.model';

import { withTransaction } from '../common/with-transaction';

export const addUserCurrencies = withTransaction(
  async (
    currencies: {
      userId: number;
      currencyId: number;
      exchangeRate?: number;
      liveRateUpdate?: boolean;
    }[],
  ) => {
    if (!currencies.length || !currencies[0]) {
      throw new ValidationError({ message: 'Currencies list is empty' });
    }

    const existingCurrencies = await UsersCurrencies.getCurrencies({
      userId: currencies[0].userId,
    });
    const alreadyExistsIds: number[] = [];

    existingCurrencies.forEach((item) => {
      const index = currencies.findIndex((currency) => currency.currencyId === item.currencyId);

      if (index >= 0) {
        alreadyExistsIds.push(currencies[index]!.currencyId);
        currencies.splice(index, 1);
      }
    });

    const result = await Promise.all(currencies.map((item) => UsersCurrencies.addCurrency(item)));

    return { currencies: result, alreadyExistingIds: alreadyExistsIds };
  },
);
