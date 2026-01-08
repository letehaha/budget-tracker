import { AccountModel, PAYMENT_TYPES } from '@bt/shared/types';

export * from './vue-query';

// export const isDevEnv = process.env.NODE_ENV === "development";
// export const isProdEnv = process.env.NODE_ENV === "production";

export type VerbosePaymentType = {
  value: PAYMENT_TYPES;
  label: string;
};

/**
 * Maps payment types to their translation keys.
 * Use with t() from vue-i18n: t(item.label)
 */
export const VERBOSE_PAYMENT_TYPES: VerbosePaymentType[] = [
  { value: PAYMENT_TYPES.creditCard, label: 'common.paymentTypes.creditCard' },
  { value: PAYMENT_TYPES.bankTransfer, label: 'common.paymentTypes.bankTransfer' },
  { value: PAYMENT_TYPES.cash, label: 'common.paymentTypes.cash' },
  { value: PAYMENT_TYPES.debitCard, label: 'common.paymentTypes.debitCard' },
  { value: PAYMENT_TYPES.mobilePayment, label: 'common.paymentTypes.mobilePayment' },
  { value: PAYMENT_TYPES.voucher, label: 'common.paymentTypes.voucher' },
  { value: PAYMENT_TYPES.webPayment, label: 'common.paymentTypes.webPayment' },
];

const OUT_OF_WALLET_ACCOUNT_NAME_KEY = 'common.outOfWallet';

type OutOfWalletAccountModel = AccountModel & {
  _isOutOfWallet?: boolean;
  id: number;
};

/**
 * Mock account for "out of wallet" transactions.
 * The name property contains a translation key. Use t(account.name) to display.
 */
export const OUT_OF_WALLET_ACCOUNT_MOCK = {
  _isOutOfWallet: true,
  name: OUT_OF_WALLET_ACCOUNT_NAME_KEY,
  id: null,
} as OutOfWalletAccountModel;

export * from './account-categories-verbose';
export * from './ai-features';
