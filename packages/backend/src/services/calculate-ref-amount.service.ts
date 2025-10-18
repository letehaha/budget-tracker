import { ValidationError } from '@js/errors';
import { CacheClient } from '@js/utils/cache';
import { logger } from '@js/utils/logger';
import * as Currencies from '@models/Currencies.model';
import * as UsersCurrencies from '@models/UsersCurrencies.model';
import * as userExchangeRateService from '@services/user-exchange-rate';

import { withTransaction } from './common/with-transaction';

const refAmountCache = new CacheClient<string>({
  logPrefix: 'calculateRefAmountImpl',
  ttl: 3600, // 1 hour
  parseJson: true,
});

/**
 * Calculates the reference amount for the provided currencies and parameters.
 * If the quote currency code is not provided, the default user currency is used.
 * If the base currency code is the same as the user's default currency or the quote currency, the original amount is returned.
 *
 * @async
 * @export
 * @param {Object} params
 * @param {number} params.amount - The amount to be converted. Amount represents `baseCode` currency.
 * @param {number} params.userId - The ID of the user for whom the exchange rate is to be fetched.
 * @param {string} params.baseCode - The base currency code.
 * @param {string} [params.quoteCode] - The quote currency code (optional, uses user's default currency if not provided).
 * @returns {Promise<number>} The reference amount after conversion, or the original amount if the base currency is the user's default or the same as the quote currency.
 * @throws {Error} Throws an error if the exchange rate cannot be fetched or the transaction fails.
 * @example
 * const refAmount = await calculateRefAmount({ amount: 100, userId: 42, baseCode: 'USD', quoteCode: 'EUR' });
 * const refAmountForDefaultUserCurrency = await calculateRefAmount({ amount: 100, userId: 42, baseCode: 'USD' });
 */
async function calculateRefAmountImpl(params: Params): Promise<number> {
  const { baseCode, quoteCode, userId, amount } = params;

  // **REDIS CACHE CHECK** - Cache the final converted amount
  const dateStr = new Date(params.date).toISOString().split('T')[0];
  refAmountCache.setCacheKey(`ref_amount:${userId}:${amount}:${baseCode}:${quoteCode || 'default'}:${dateStr}`);

  const cachedAmount = await refAmountCache.read();

  if (cachedAmount !== null) {
    return parseFloat(cachedAmount);
  }

  try {
    let defaultUserCurrency: Currencies.default | undefined = undefined;

    if (!quoteCode) {
      const result = await UsersCurrencies.getCurrency({
        userId,
        isDefaultCurrency: true,
      });

      if (!result) {
        throw new ValidationError({
          message: 'Cannot find currency to calculate ref amount!',
        });
      }
      defaultUserCurrency = result.currency;
    }

    // If baseCode same as default currency code no need to calculate anything
    if (defaultUserCurrency?.code === baseCode || quoteCode === baseCode) {
      await refAmountCache.write({ value: amount.toString() });
      return amount;
    }

    if (!baseCode || (quoteCode === undefined && defaultUserCurrency === undefined)) {
      throw new ValidationError({
        message: 'Cannot calculate ref amount',
        details: { baseCode, defaultUserCurrency },
      });
    }

    const result = await userExchangeRateService.getExchangeRate({
      userId,
      date: new Date(params.date),
      baseCode,
      quoteCode: quoteCode || defaultUserCurrency!.code,
    });
    const rate = result.rate;

    const isNegative = amount < 0;
    const refAmount = amount === 0 ? 0 : Math.floor(Math.abs(amount) * rate);
    const finalAmount = isNegative ? refAmount * -1 : refAmount;

    // **CACHE THE FINAL RESULT**
    await refAmountCache.write({ value: finalAmount.toString() });

    return finalAmount;
  } catch (e) {
    if (process.env.NODE_ENV !== 'test') {
      logger.error(e as Error);
    }
    throw e;
  }
}

type Params = {
  amount: number;
  userId: number;
  date: Date | string;
  baseCode: string;
  quoteCode?: string;
};

export const calculateRefAmount = withTransaction(calculateRefAmountImpl);
