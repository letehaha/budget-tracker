import { Money } from '@common/types/money';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import { CacheClient } from '@js/utils/cache';
import { logger } from '@js/utils/logger';
import * as Currencies from '@models/currencies.model';
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
  const { baseCode, quoteCode, userId, amount, bypassCache = false } = params;

  const dateStr = new Date(params.date).toISOString().split('T')[0];
  const amountCents = amount.toCents();

  try {
    // Resolve the quote currency BEFORE building the cache key. When `quoteCode` is
    // omitted the result depends on the user's CURRENT default currency, so the key
    // must encode that resolved code — not a literal "default" placeholder. Keying
    // on "default" made an entry computed under the user's OLD base currency satisfy
    // a lookup after they changed base (both collapse to the same key), re-serving a
    // stale cross-base value. Old-format entries simply miss the new key and recompute.
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

    const resolvedQuoteCode = quoteCode ?? defaultUserCurrency?.code;

    if (!baseCode || !resolvedQuoteCode) {
      throw new ValidationError({
        message: t({ key: 'currencies.cannotCalculateRefAmount' }),
        details: { baseCode, defaultUserCurrency },
      });
    }

    const cacheKey = `ref_amount:${userId}:${amountCents}:${baseCode}:${resolvedQuoteCode}:${dateStr}`;

    if (!bypassCache) {
      const cachedAmount = await refAmountCache.read(cacheKey);

      if (cachedAmount !== null) {
        return Money.fromCents(parseInt(cachedAmount, 10));
      }
    }

    // If baseCode equals the resolved quote currency, no conversion is needed.
    if (resolvedQuoteCode === baseCode) {
      if (!bypassCache) {
        await refAmountCache.write({ key: cacheKey, value: amountCents.toString() });
      }
      return amount;
    }

    const result = await userExchangeRateService.getExchangeRate({
      userId,
      date: new Date(params.date),
      baseCode,
      quoteCode: resolvedQuoteCode,
      bypassCache,
    });

    const finalAmount = calculateRefAmountFromParams({ amount, rate: result.rate });

    // **CACHE THE FINAL RESULT** (store as cents for cache consistency). Skipped
    // under `bypassCache`: see the `bypassCache` doc below — write-back inside an
    // uncommitted rate-write transaction would poison the cache on rollback.
    if (!bypassCache) {
      await refAmountCache.write({ key: cacheKey, value: finalAmount.toCents().toString() });
    }

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
  /**
   * Do not touch the redis cache at all — neither read from it nor write results
   * back — on both the ref-amount layer here and the cross-rate layer inside
   * `getExchangeRate`. Required for balance remeasure flows that run inside the
   * custom-rate edit/remove `withTransaction`: they must observe a rate that changed
   * within the cache TTL (so reads are skipped), and writing the freshly computed
   * amount back before that rate write commits would poison the 1h-TTL cache with a
   * value derived from a rate that may still roll back.
   */
  bypassCache?: boolean;
};

export const calculateRefAmount = withTransaction(calculateRefAmountImpl);
