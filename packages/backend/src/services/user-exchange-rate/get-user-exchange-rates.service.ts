import { logger } from '@js/utils';
import * as UsersCurrencies from '@models/UsersCurrencies.model';

import { withTransaction } from '../common/with-transaction';
import { getExchangeRate } from './get-exchange-rate.service';

/**
 * By default we just return system exchange rates from ExchangeRates table.
 * If user wants to edit exchange rate, he can add one to UserExchangeRates, so
 * then we will return and use his custom rate. If user wants to use system rate
 * back, we need to remove his custom record from UserExchangeRates table
 */

export const getUserExchangeRates = withTransaction(async ({ userId }: { userId: number }) => {
  const userBaseCurrency = await UsersCurrencies.getBaseCurrency({ userId });
  const userCurrencies = await UsersCurrencies.getCurrencies({ userId });

  const results = await Promise.allSettled(
    userCurrencies.map((item) =>
      getExchangeRate({
        userId,
        baseCode: item.currencyCode,
        quoteCode: userBaseCurrency.currencyCode,
        date: new Date(),
      }),
    ),
  );

  const exchangeRates: Awaited<ReturnType<typeof getExchangeRate>>[] = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      exchangeRates.push(result.value);
    } else {
      logger.error(
        `[getUserExchangeRates] Rate unavailable for ${userCurrencies[i]!.currencyCode}/${userBaseCurrency.currencyCode}`,
        { error: result.reason instanceof Error ? result.reason.message : String(result.reason) },
      );
    }
  });

  return exchangeRates;
});
