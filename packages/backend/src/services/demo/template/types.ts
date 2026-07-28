import { PAYMENT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';

import type { DemoAccountKey } from '../demo-config';

/**
 * A generated transaction, still free of database ids.
 *
 * Amounts are positive cents in the account's own currency; direction lives in
 * `transactionType`, matching how the real create-transaction service stores it.
 */
export interface DemoTemplateTransaction {
  /**
   * Set when a split, refund link, group, or subscription period points at this
   * row. The seeder mints one transaction id per ref before inserting, since
   * the bulk insert runs with hooks off and never reads ids back.
   */
  ref?: string;
  accountKey: DemoAccountKey;
  /** Either a main category key or a `parent/child` subcategory key. */
  categoryKey: string;
  amount: number;
  transactionType: TRANSACTION_TYPES;
  /** Days before the reference date the seeder anchors the template to. 0 is today. */
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
  /**
   * When this copy was generated. The daily cache refresh renews it, but the
   * demo's "today" is the `referenceDate` the seeder passes, not this field.
   */
  generatedAt: Date;
  transactions: DemoTemplateTransaction[];
  splits: DemoTemplateSplit[];
  refunds: DemoTemplateRefund[];
  groups: DemoTemplateGroup[];
  subscriptionPayments: DemoTemplateSubscriptionPayment[];
}
