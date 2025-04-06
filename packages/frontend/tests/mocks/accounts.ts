import { ACCOUNT_CATEGORIES, ACCOUNT_TYPES, AccountModel } from '@bt/shared/types';

import { USER_CURRENCIES } from './currencies';
import { USER } from './user';

export const eurAccountName = 'Account EUR';
export const usdAccountName = 'Account USD';
export const uahAccountName = 'Account UAH';
export const uah2AccountName = 'Account UAH (2)';

export const ACCOUNTS: AccountModel[] = [
  {
    id: 1,
    name: eurAccountName,
    initialBalance: 0,
    refInitialBalance: 0,
    currentBalance: 9,
    refCurrentBalance: 322.65,
    creditLimit: 0,
    refCreditLimit: 0,
    type: ACCOUNT_TYPES.system,
    accountCategory: ACCOUNT_CATEGORIES.general,
    currencyId: USER_CURRENCIES.find((item) => item.currency.code === 'EUR').currencyId,
    userId: USER.id,
    externalId: null,
    externalData: null,
    isEnabled: true,
  },
  {
    id: 2,
    name: usdAccountName,
    initialBalance: 0,
    refInitialBalance: 0,
    currentBalance: 20,
    refCurrentBalance: 745.99,
    creditLimit: 0,
    refCreditLimit: 0,
    type: ACCOUNT_TYPES.system,
    accountCategory: ACCOUNT_CATEGORIES.general,
    currencyId: USER_CURRENCIES.find((item) => item.currency.code === 'USD').currencyId,
    userId: USER.id,
    externalId: null,
    externalData: null,
    isEnabled: true,
  },
  {
    id: 3,
    name: uahAccountName,
    initialBalance: 0,
    refInitialBalance: 0,
    currentBalance: 0,
    refCurrentBalance: 0,
    creditLimit: 0,
    refCreditLimit: 0,
    type: ACCOUNT_TYPES.system,
    accountCategory: ACCOUNT_CATEGORIES.general,
    currencyId: USER_CURRENCIES.find((item) => item.currency.code === 'UAH').currencyId,
    userId: USER.id,
    externalId: null,
    externalData: null,
    isEnabled: true,
  },
  {
    id: 4,
    name: uah2AccountName,
    initialBalance: 0,
    refInitialBalance: 0,
    currentBalance: 0,
    refCurrentBalance: 0,
    creditLimit: 0,
    refCreditLimit: 0,
    type: ACCOUNT_TYPES.system,
    accountCategory: ACCOUNT_CATEGORIES.general,
    currencyId: USER_CURRENCIES.find((item) => item.currency.code === 'UAH').currencyId,
    userId: USER.id,
    externalId: null,
    externalData: null,
    isEnabled: true,
  },
];

export const getEurAccount = () => ACCOUNTS.find((item) => item.name === eurAccountName);
export const getUsdAccount = () => ACCOUNTS.find((item) => item.name === usdAccountName);
export const getUahAccount = () => ACCOUNTS.find((item) => item.name === uahAccountName);
export const getUah2Account = () => ACCOUNTS.find((item) => item.name === uah2AccountName);
