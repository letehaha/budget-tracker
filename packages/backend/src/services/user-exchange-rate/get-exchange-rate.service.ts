import { NotFoundError } from '@js/errors';
import * as Currencies from '@models/Currencies.model';
import * as ExchangeRates from '@models/ExchangeRates.model';
import * as UserExchangeRates from '@models/UserExchangeRates.model';
import UsersCurrencies, { getBaseCurrency } from '@models/UsersCurrencies.model';
import {
  API_LAYER_BASE_CURRENCY_CODE,
  fetchExchangeRatesForDate,
} from '@services/exchange-rates/fetch-exchange-rates-for-date';
import { endOfDay, startOfDay } from 'date-fns';
import { Op } from 'sequelize';

// Round to 5 precision
const formatRate = (rate: number) => Math.trunc(rate * 100000) / 100000;

export async function getExchangeRate({
  userId,
  date,
  ...params
}: ExchangeRateParams): Promise<ExchangeRateReturnType> {
  let pair: { baseCode: string; quoteCode: string };

  if ('baseId' in params && 'quoteId' in params) {
    const { code: baseCode } = await Currencies.getCurrency({
      id: params.baseId,
    });
    const { code: quoteCode } = await Currencies.getCurrency({
      id: params.quoteId,
    });
    pair = { baseCode, quoteCode };
  } else {
    pair = { baseCode: params.baseCode, quoteCode: params.quoteCode };
  }

  // If base and qoute are the same currency, early return with `1`
  if (pair.baseCode === pair.quoteCode) {
    return {
      baseCode: pair.baseCode,
      quoteCode: pair.quoteCode,
      rate: 1,
      date,
    };
  }

  // When currencies are different, make sure that base_code currency is linked
  // to user's currencies, since usually quite is always a user_default_currency
  const userCurrency = await UsersCurrencies.findOne({
    where: { userId },
    attributes: ['liveRateUpdate'],
    include: [
      {
        model: Currencies.default,
        where: { code: pair.baseCode },
        attributes: [], // No need to fetch extra attributes
      },
    ],
    raw: true,
  });

  if (!userCurrency) {
    throw new NotFoundError({ message: 'Asked currency is not connected' });
  }

  const userDefaultCurrency = await getBaseCurrency({ userId });

  // If user has custom live rate AND quote_code is user's base_currency, then
  // skip any checks and calculations and simply return what user has set
  if (userCurrency && userCurrency.liveRateUpdate === false && pair.quoteCode === userDefaultCurrency.currency.code) {
    const [userExchangeRate] = await UserExchangeRates.getRates({
      userId,
      pair,
    });

    if (userExchangeRate) {
      return {
        ...userExchangeRate,
        rate: formatRate(userExchangeRate.rate),
        custom: true,
      };
    }
  }

  let baseRate: ExchangeRates.default | null = null;
  let quoteRate: ExchangeRates.default | null = null;

  const loadRate = (code: string, rateDate = date) => {
    if (code === API_LAYER_BASE_CURRENCY_CODE) {
      return null; // No need to fetch if it's the API's default base currency
    }
    const liveRateWhereCondition = {
      date: { [Op.between]: [startOfDay(rateDate), endOfDay(rateDate)] },
    };
    return ExchangeRates.default.findOne({
      where: {
        ...liveRateWhereCondition,
        baseCode: API_LAYER_BASE_CURRENCY_CODE,
        quoteCode: code,
      },
      raw: true,
    });
  };

  baseRate = await loadRate(pair.baseCode);
  quoteRate = await loadRate(pair.quoteCode);

  // If none rates found in the DB, it means we need to sync data manually
  if (!baseRate || !quoteRate) {
    await fetchExchangeRatesForDate(date);

    // Retry fetching the missing rates after the API call
    if (!baseRate) baseRate = await loadRate(pair.baseCode);
    if (!quoteRate) quoteRate = await loadRate(pair.quoteCode);
  }

  // If still no rates found in the DB, it means something happened in the
  // meanwhile, and we need to take the rate for the nearest date
  if (!baseRate || !quoteRate) {
    // TODO: if cannot load rate for "today", load for the nearest date, and send
    // more fields to client to warn about it and say for which date currency rate
    // is loaded
  }

  if (pair.baseCode === API_LAYER_BASE_CURRENCY_CODE) {
    return {
      ...pair,
      rate: formatRate(quoteRate!.rate), // Directly use the base rate
      date: quoteRate!.date,
    };
  } else if (pair.quoteCode === API_LAYER_BASE_CURRENCY_CODE) {
    return {
      ...pair,
      rate: formatRate(1 / baseRate!.rate), // Invert the quote rate
      date: baseRate!.date,
    };
  } else {
    const crossRate = quoteRate!.rate / baseRate!.rate;
    return {
      ...pair,
      rate: formatRate(crossRate),
      date: quoteRate!.date,
    };
  }
}

type ExchangeRateParams = {
  userId: number;
  date: Date;
} & ({ baseId: number; quoteId: number } | { baseCode: string; quoteCode: string });

type ExchangeRateReturnType = {
  baseCode: string;
  quoteCode: string;
  date: Date;
  rate: number;
  // Add `custom` so client can understand that rate is custom
  custom?: boolean;
};
