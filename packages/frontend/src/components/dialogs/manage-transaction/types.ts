import type { VerbosePaymentType } from '@/common/const';
import type { FormattedCategory } from '@/common/types';
import { AccountModel, TransactionModel } from '@bt/shared/types';

export enum FORM_TYPES {
  income = 'income',
  expense = 'expense',
  transfer = 'transfer',
}

export type RefundsAnoterTx = TransactionModel | null | undefined;
export type RefundedByAnotherTxs = TransactionModel[] | null | undefined;

/**
 * UI representation of a transaction split for form editing.
 * Uses FormattedCategory for UI display and optional id for existing splits.
 */
export interface FormSplit {
  /** UUID for existing splits, undefined for new ones */
  id?: string;
  category: FormattedCategory | null;
  amount: number | null;
  note?: string | null;
}

export interface UI_FORM_STRUCT {
  amount: number;
  account: AccountModel;
  toAccount?: AccountModel;
  category: FormattedCategory;
  time: Date;
  paymentType: VerbosePaymentType;
  note?: string;
  type: FORM_TYPES;
  targetAmount?: number;
  refundedByTxs: RefundedByAnotherTxs;
  refundsTx: RefundsAnoterTx;
  /** Optional splits for distributing transaction amount across multiple categories */
  splits?: FormSplit[];
}
