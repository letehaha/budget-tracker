import type { VerbosePaymentType } from '@/common/const';
import type { FormattedCategory } from '@/common/types';
import { AccountModel, TransactionModel } from '@bt/shared/types';

export enum FORM_TYPES {
  income = 'income',
  expense = 'expense',
  transfer = 'transfer',
}

/**
 * Represents a refund relationship with optional split targeting.
 * When a transaction has splits, refunds should target specific splits.
 */
export interface RefundWithSplit {
  transaction: TransactionModel;
  /** The split ID this refund targets. Required when the original transaction has splits. */
  splitId?: string;
}

export type RefundsAnoterTx = RefundWithSplit | null | undefined;
export type RefundedByAnotherTxs = RefundWithSplit[] | null | undefined;

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
  amount: number | null;
  account: AccountModel | null;
  toAccount?: AccountModel | null;
  category: FormattedCategory;
  time: Date;
  paymentType: VerbosePaymentType | null;
  note?: string;
  type: FORM_TYPES;
  targetAmount?: number | null;
  refundedByTxs: RefundedByAnotherTxs;
  refundsTx: RefundsAnoterTx;
  /** Optional splits for distributing transaction amount across multiple categories */
  splits?: FormSplit[];
  /** Optional tag IDs to associate with the transaction */
  tagIds?: number[];
}
