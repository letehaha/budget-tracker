import { Money } from '@common/types/money';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import { CacheClient } from '@js/utils/cache';
import { logger } from '@js/utils/logger';
import type * as Currencies from '@models/currencies.model';
import * as UsersCurrencies from '@models/users-currencies.model';
import * as userExchangeRateService from '@services/user-exchange-rate';

import { calculateRefAmountFromParams } from './calculate-ref-amount.utils';
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
async function calculateRefAmountImpl(params: Params): Promise<Money> {
  const { baseCode, quoteCode, userId, amount } = params;

  // **REDIS CACHE CHECK** - Cache the final converted amount (stored as cents)
  const dateStr = new Date(params.date).toISOString().split('T')[0];
  const amountCents = amount.toCents();
  const cacheKey = `ref_amount:${userId}:${amountCents}:${baseCode}:${quoteCode || 'default'}:${dateStr}`;

  const cachedAmount = await refAmountCache.read(cacheKey);

  if (cachedAmount !== null) {
    return Money.fromCents(parseInt(cachedAmount, 10));
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
          message: t({ key: 'currencies.cannotFindForRefAmount' }),
        });
      }
      defaultUserCurrency = result.currency;
    }

    // If baseCode same as default currency code no need to calculate anything
    if (defaultUserCurrency?.code === baseCode || quoteCode === baseCode) {
      await refAmountCache.write({ key: cacheKey, value: amountCents.toString() });
      return amount;
    }

    if (!baseCode || (quoteCode === undefined && defaultUserCurrency === undefined)) {
      throw new ValidationError({
        message: t({ key: 'currencies.cannotCalculateRefAmount' }),
        details: { baseCode, defaultUserCurrency },
      });
    }

    const result = await userExchangeRateService.getExchangeRate({
      userId,
      date: new Date(params.date),
      baseCode,
      quoteCode: quoteCode || defaultUserCurrency!.code,
    });

    const finalAmount = calculateRefAmountFromParams({ amount, rate: result.rate });

    // **CACHE THE FINAL RESULT** (store as cents for cache consistency)
    await refAmountCache.write({ key: cacheKey, value: finalAmount.toCents().toString() });

    return finalAmount;
  } catch (e) {
    if (process.env.NODE_ENV !== 'test') {
      logger.error(e as Error);
    }
    throw e;
  }
}

export { calculateRefAmountFromParams } from './calculate-ref-amount.utils';

type Params = {
  amount: Money;
  userId: number;
  date: Date | string;
  baseCode: string;
  quoteCode?: string;
};

export const calculateRefAmount = withTransaction(calculateRefAmountImpl);
