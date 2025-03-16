import { ValidationError } from '@js/errors';
import { logger } from '@js/utils/logger';
import * as Currencies from '@models/Currencies.model';
import * as UsersCurrencies from '@models/UsersCurrencies.model';
import * as userExchangeRateService from '@services/user-exchange-rate';

import { withTransaction } from './common/with-transaction';

/**
 * Calculates the reference amount for the provided currencies and parameters.
 * Accepts either currency codes or currency IDs.
 * If the quote currency code or ID is not provided, the default user currency is used.
 * If the base currency code or ID is the same as the user's default currency or the quote currency, the original amount is returned.
 *
 * @async
 * @export
 * @param {Object} params
 * @param {number} params.amount - The amount to be converted. Amount represents `baseCode` or `baseId` currency.
 * @param {number} params.userId - The ID of the user for whom the exchange rate is to be fetched.
 * @param {string} [params.baseCode] - The base currency code (optional if `baseId` provided).
 * @param {string} [params.quoteCode] - The quote currency code (optional if `quoteId` provided or if using user's default currency).
 * @param {number} [params.baseId] - The base currency ID (optional if `baseCode` provided).
 * @param {number} [params.quoteId] - The quote currency ID (optional if `quoteCode` provided or if using user's default currency).
 * @returns {Promise<number>} The reference amount after conversion, or the original amount if the base currency is the user's default or the same as the quote currency.
 * @throws {Error} Throws an error if the exchange rate cannot be fetched or the transaction fails.
 * @example
 * const refAmount = await calculateRefAmount({ amount: 100, userId: 42, baseCode: 'USD', quoteCode: 'EUR' });
 * const refAmountByIds = await calculateRefAmount({ amount: 100, userId: 42, baseId: 1, quoteId: 2 });
 * const refAmountForDefaultUserCurrency = await calculateRefAmount({ amount: 100, userId: 42, baseCode: 'USD' });
 */
async function calculateRefAmountImpl(params: Params): Promise<number> {
  let { baseCode, quoteCode } = params;
  const { baseId, quoteId, userId, amount } = params;

  try {
    let defaultUserCurrency: Currencies.default | undefined = undefined;

    if (!baseCode && baseId) {
      baseCode = (await Currencies.getCurrency({ id: baseId }))?.code;
    }

    if (!quoteCode && quoteId) {
      quoteCode = (await Currencies.getCurrency({ id: quoteId }))?.code;
    }

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

    // If baseCade same as default currency code no need to calculate anything
    if (defaultUserCurrency?.code === baseCode || quoteCode === baseCode) {
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

    return isNegative ? refAmount * -1 : refAmount;
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
} & (
  | {
      baseCode: string;
      quoteCode?: string;
      baseId?: never;
      quoteId?: never;
    }
  | {
      baseCode?: never;
      quoteCode?: never;
      baseId: number;
      quoteId?: number;
    }
);

export const calculateRefAmount = withTransaction(calculateRefAmountImpl);
