import { PAYMENT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';

/**
 * A generated transaction, still free of database ids.
 *
 * Amounts are positive cents in the account's own currency; direction lives in
 * `transactionType`, matching how the real create-transaction service stores it.
 */
export interface DemoTemplateTransaction {
  /**
   * Set only when another part of the template points at this row: a split, a
   * refund link, a group, or a subscription period. The seeder mints one
   * transaction id per ref before inserting, because the bulk insert runs with
   * hooks off and never reads ids back.
   */
  ref?: string;
  accountKey: string;
  /** Either a main category key or a `parent/child` subcategory key. */
  categoryKey: string;
  amount: number;
  transactionType: TRANSACTION_TYPES;
  /** Days before the template's `generatedAt`. 0 is today. */
  dayOffset: number;
  /** Minutes past local midnight, so same-day rows read in a plausible order. */
  minuteOfDay: number;
  note: string;
  /** Resolved to a `Payees` row. Absent for rows with no counterparty, like transfers. */
  merchantName?: string;
  paymentType: PAYMENT_TYPES;
  /** Defaults to `not_transfer` when absent. */
  transferNature?: TRANSACTION_TRANSFER_NATURE;
  /** Shared by exactly two legs; the seeder turns it into one `transferId`. */
  transferKey?: string;
  tagKeys?: string[];
}

/** Splits never move money: they re-attribute part of a transaction to other categories. */
export interface DemoTemplateSplit {
  transactionRef: string;
  categoryKey: string;
  amount: number;
  note?: string;
}

export interface DemoTemplateRefund {
  originalRef: string;
  refundRef: string;
}

export interface DemoTemplateGroup {
  name: string;
  note?: string;
  transactionRefs: string[];
}

/** One historical payment of a subscription, used to build a paid period. */
export interface DemoTemplateSubscriptionPayment {
  subscriptionName: string;
  transactionRef: string;
  dueDayOffset: number;
}

export interface DemoTemplate {
  generatedAt: Date;
  transactions: DemoTemplateTransaction[];
  splits: DemoTemplateSplit[];
  refunds: DemoTemplateRefund[];
  groups: DemoTemplateGroup[];
  subscriptionPayments: DemoTemplateSubscriptionPayment[];
}
