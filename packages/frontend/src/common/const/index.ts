import { AccountModel, PAYMENT_TYPES } from '@bt/shared/types';

export * from './vue-query';

export const MONOBANK_API_TOKEN_LENGTH = 44;

// export const isDevEnv = process.env.NODE_ENV === "development";
// export const isProdEnv = process.env.NODE_ENV === "production";

export type VerbosePaymentType = {
  value: PAYMENT_TYPES;
  label: string;
};
export const VERBOSE_PAYMENT_TYPES: VerbosePaymentType[] = [
  { value: PAYMENT_TYPES.creditCard, label: 'Credit Card' },
  { value: PAYMENT_TYPES.bankTransfer, label: 'Bank Transfer' },
  { value: PAYMENT_TYPES.cash, label: 'Cash' },
  { value: PAYMENT_TYPES.debitCard, label: 'Debit Card' },
  { value: PAYMENT_TYPES.mobilePayment, label: 'Mobile Payment' },
  { value: PAYMENT_TYPES.voucher, label: 'Voucher' },
  { value: PAYMENT_TYPES.webPayment, label: 'Web Payment' },
];

const OUT_OF_WALLET_ACCOUNT_NAME = 'Out of wallet';
type OutOfWalletAccountModel = AccountModel & {
  _isOutOfWallet?: boolean;
  id: null;
};

export const OUT_OF_WALLET_ACCOUNT_MOCK = {
  _isOutOfWallet: true,
  name: OUT_OF_WALLET_ACCOUNT_NAME,
  id: null,
} as OutOfWalletAccountModel;

export * from './account-categories-verbose';
