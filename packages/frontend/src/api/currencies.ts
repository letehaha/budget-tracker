import { api } from '@/api/_api';
import {
  CurrencyModel,
  ExchangeRatesModel,
  RefBalanceRemeasureResult,
  UserCurrencyModel,
  UserExchangeRatesModel,
} from '@bt/shared/types';

export const getAllCurrencies = async (): Promise<CurrencyModel[]> => api.get('/models/currencies');

export const loadUserCurrencies = async (): Promise<UserCurrencyModel[]> => api.get('/user/currencies');

export const deleteCustomRate = (
  pairs: {
    baseCode: string;
    quoteCode: string;
  }[],
): Promise<{ remeasure: RefBalanceRemeasureResult }> => api.delete('/user/currency/rates', { data: { pairs } });

export const loadUserCurrenciesExchangeRates = async (): Promise<UserExchangeRatesModel[]> =>
  api.get('/user/currencies/rates');

/**
 * System (market) exchange rates for a calendar date, in the canonical
 * USD-pivot direction (`baseCode: 'USD', quoteCode: X` = 1 USD in X). Returns
 * `null` when no rates are stored for that date.
 */
export const loadExchangeRatesForDate = async (date: string): Promise<ExchangeRatesModel[] | null> =>
  api.get(`/currencies/rates/${date}`);

export const editUserCurrenciesExchangeRates = async (
  pairs: {
    baseCode: string;
    quoteCode: string;
    rate: number;
  }[],
): Promise<{ rates: UserExchangeRatesModel[]; remeasure: RefBalanceRemeasureResult }> =>
  api.put('/user/currency/rates', { pairs });

export const deleteUserCurrency = (currencyCode: string) => api.delete('/user/currency', { data: { currencyCode } });

export const setBaseUserCurrency = (currencyCode: string) => api.post('/user/currencies/base', { currencyCode });

export const changeBaseCurrency = (newCurrencyCode: string) =>
  api.post('/user/currencies/change-base', { newCurrencyCode });

export const addUserCurrencies = async (
  currencies: {
    currencyCode: string;
    exchangeRate?: number;
    liveRateUpdate?: boolean;
  }[],
) => api.post('/user/currencies', { currencies });

export const loadUserBaseCurrency = (): Promise<UserCurrencyModel> => api.get('/user/currencies/base');
