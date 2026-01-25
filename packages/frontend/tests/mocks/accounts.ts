import { ACCOUNT_CATEGORIES, ACCOUNT_TYPES, AccountWithRelinkStatus } from '@bt/shared/types';

import { USER_CURRENCIES } from './currencies';
import { USER } from './user';

export const eurAccountName = 'Account EUR';
export const usdAccountName = 'Account USD';
export const uahAccountName = 'Account UAH';
export const uah2AccountName = 'Account UAH (2)';

export const ACCOUNTS: AccountWithRelinkStatus[] = [
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
    currencyCode: USER_CURRENCIES.find((item) => item.currency.code === 'EUR').currencyCode,
    userId: USER.id,
    externalId: null,
    externalData: null,
    isEnabled: true,
    needsRelink: false,
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
    currencyCode: USER_CURRENCIES.find((item) => item.currency.code === 'USD').currencyCode,
    userId: USER.id,
    externalId: null,
    externalData: null,
    isEnabled: true,
    needsRelink: false,
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
    currencyCode: USER_CURRENCIES.find((item) => item.currency.code === 'UAH').currencyCode,
    userId: USER.id,
    externalId: null,
    externalData: null,
    isEnabled: true,
    needsRelink: false,
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
    currencyCode: USER_CURRENCIES.find((item) => item.currency.code === 'UAH').currencyCode,
    userId: USER.id,
    externalId: null,
    externalData: null,
    isEnabled: true,
    needsRelink: false,
  },
];

export const getEurAccount = (overrides?: Partial<AccountWithRelinkStatus>) => ({
  ...ACCOUNTS.find((item) => item.name === eurAccountName),
  ...overrides,
});
export const getUsdAccount = (overrides?: Partial<AccountWithRelinkStatus>) => ({
  ...ACCOUNTS.find((item) => item.name === usdAccountName),
  ...overrides,
});
export const getUahAccount = (overrides?: Partial<AccountWithRelinkStatus>) => ({
  ...ACCOUNTS.find((item) => item.name === uahAccountName),
  ...overrides,
});
export const getUah2Account = (overrides?: Partial<AccountWithRelinkStatus>) => ({
  ...ACCOUNTS.find((item) => item.name === uah2AccountName),
  ...overrides,
});
