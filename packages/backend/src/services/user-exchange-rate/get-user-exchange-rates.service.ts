import { logger } from '@js/utils';
import * as UsersCurrencies from '@models/users-currencies.model';
import { ensureUserBaseCurrency } from '@services/currencies/ensure-base-currency.service';

import { withTransaction } from '../common/with-transaction';
import { getExchangeRate } from './get-exchange-rate.service';

/**
 * By default we just return system exchange rates from ExchangeRates table.
 * If user wants to edit exchange rate, he can add one to UserExchangeRates, so
 * then we will return and use his custom rate. If user wants to use system rate
 * back, we need to remove his custom record from UserExchangeRates table
 */

export const getUserExchangeRates = withTransaction(async ({ userId }: { userId: number }) => {
  const userCurrencies = await UsersCurrencies.getCurrencies({ userId });

  // Nothing to convert, and no base currency is needed to say so. Checked before
  // ensureUserBaseCurrency so a user who has connected no currencies at all is
  // not forced through a heal that has nothing to adopt from.
  if (userCurrencies.length === 0) return [];

  const userBaseCurrency = await ensureUserBaseCurrency({ userId });

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
