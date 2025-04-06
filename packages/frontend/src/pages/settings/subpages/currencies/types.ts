import { UserCurrencyModel } from '@bt/shared/types';

export type CurrencyWithExchangeRate = UserCurrencyModel & {
  rate: number;
  quoteCode: string;
  custom?: boolean;
  quoteRate: number;
};
