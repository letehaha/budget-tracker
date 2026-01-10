import { AccountModel, CategoryModel, TransactionModel, UserModel } from './db-models';
import { ACCOUNT_TYPES, SORT_DIRECTIONS, TRANSACTION_TYPES } from './enums';

export type BodyPayload = {
  [key: string | number]: string | number | boolean | undefined;
};
export type QueryPayload = {
  [key: string]: string | number | boolean | undefined;
};

export interface CreateAccountBody extends BodyPayload {
  accountCategory: AccountModel['accountCategory'];
  currencyCode: AccountModel['currencyCode'];
  name: AccountModel['name'];
  initialBalance: AccountModel['initialBalance'];
  creditLimit: AccountModel['creditLimit'];
  isEnabled?: AccountModel['isEnabled'];
  type?: AccountModel['type'];
}

export interface UpdateAccountBody extends BodyPayload {
  accountCategory?: AccountModel['accountCategory'];
  name?: AccountModel['name'];
  currentBalance?: AccountModel['currentBalance'];
  creditLimit?: AccountModel['creditLimit'];
  isEnabled?: AccountModel['isEnabled'];
}

export interface GetBalanceHistoryPayload extends QueryPayload {
  accountId?: AccountModel['id'];
  // yyyy-mm-dd
  from?: string;
  // yyyy-mm-dd
  to?: string;
}

export interface GetTotalBalancePayload extends QueryPayload {
  date: string;
}

export interface GetSpendingCategoriesPayload extends QueryPayload {
  accountId?: AccountModel['id'];
  // yyyy-mm-dd
  from?: string;
  // yyyy-mm-dd
  to?: string;
  raw?: boolean;
}

export type SpendingStructure = { name: string; color: string; amount: number };
export type GetSpendingsByCategoriesReturnType = {
  [categoryId: number]: SpendingStructure;
};

export interface GetTransactionsQuery extends QueryPayload {
  sort?: SORT_DIRECTIONS;
  includeUser?: boolean;
  includeAccount?: boolean;
  includeCategory?: boolean;
  includeAll?: boolean;
  nestedInclude?: boolean;
  limit?: number;
  from?: number;
  type?: TRANSACTION_TYPES;
  accountType?: ACCOUNT_TYPES;
  accountId?: number;
  excludeTransfer?: boolean;
  excludeRefunds?: boolean;
}

export type GetTransactionsResponse = TransactionModel[];

export interface SplitInput {
  categoryId: number;
  amount: number;
  note?: string | null;
}

export interface CreateTransactionBody {
  amount: TransactionModel['amount'];
  note?: TransactionModel['note'];
  time: string;
  transactionType: TransactionModel['transactionType'];
  paymentType: TransactionModel['paymentType'];
  accountId: TransactionModel['accountId'];
  categoryId?: TransactionModel['categoryId'];
  destinationAccountId?: TransactionModel['accountId'];
  destinationAmount?: TransactionModel['amount'];
  destinationTransactionId?: number;
  commissionRate?: TransactionModel['commissionRate'];
  transferNature?: TransactionModel['transferNature'];
  // When transaction is being created, it can be marked as a refund for another transaction
  refundForTxId?: number;
  // When refunding a split specifically (required when original tx has splits)
  refundForSplitId?: string;
  // Optional splits for multi-category transactions
  splits?: SplitInput[];
}

export interface UpdateTransactionBody {
  amount?: TransactionModel['amount'];
  destinationAmount?: TransactionModel['amount'];
  destinationTransactionId?: TransactionModel['id'];
  note?: TransactionModel['note'];
  time?: string;
  transactionType?: TransactionModel['transactionType'];
  paymentType?: TransactionModel['paymentType'];
  accountId?: TransactionModel['accountId'];
  destinationAccountId?: TransactionModel['accountId'];
  categoryId?: TransactionModel['categoryId'];
  transferNature?: TransactionModel['transferNature'];
  // Pass tx id if you want to mark which tx it refunds
  refundsTxId?: number | null;
  // When refunding a split specifically (required when original tx has splits)
  refundsSplitId?: string | null;
  // Pass tx ids that will refund the source tx (with optional splitId for each)
  refundedByTxIds?: number[] | null;
  // Mapping of refundTxId -> splitId for split-specific refunds
  refundedBySplitIds?: Record<number, string> | null;
  // Optional splits for multi-category transactions (null to clear all splits)
  splits?: SplitInput[] | null;
}

export interface UnlinkTransferTransactionsBody {
  transferIds: string[];
}
// Array of income/expense pairs to link between each other. It's better to pass
// exactly exactly as described in the type, but in fact doesn't really matter
export interface LinkTransactionsBody {
  ids: [baseTxId: number, destinationTxId: number][];
}

export type CreateCategoryBody = {
  name: CategoryModel['name'];
  color?: CategoryModel['color'];
  imageUrl?: CategoryModel['imageUrl'];
  parentId?: CategoryModel['parentId'];
};
export type CreateCategoryResponse = CategoryModel;

export type EditCategoryBody = Partial<Pick<CategoryModel, 'name' | 'color' | 'imageUrl'>>;
export type EditCategoryResponse = CategoryModel[];

// Cash Flow Analytics
export type CashFlowGranularity = 'monthly' | 'biweekly' | 'weekly';

export interface GetCashFlowPayload extends QueryPayload {
  // yyyy-mm-dd (required)
  from: string;
  // yyyy-mm-dd (required)
  to: string;
  granularity: CashFlowGranularity;
  accountId?: AccountModel['id'];
  excludeCategories?: boolean;
}

export interface CashFlowPeriodData {
  // yyyy-mm-dd
  periodStart: string;
  // yyyy-mm-dd
  periodEnd: string;
  income: number;
  expenses: number;
  netFlow: number;
}

export interface GetCashFlowResponse {
  periods: CashFlowPeriodData[];
  totals: {
    income: number;
    expenses: number;
    netFlow: number;
    // percentage (0-100)
    savingsRate: number;
  };
}

// Cumulative Analytics (Trends Comparison)
export type CumulativeMetric = 'expenses' | 'income' | 'savings';

export interface GetCumulativePayload extends QueryPayload {
  // yyyy-mm-dd (required)
  from: string;
  // yyyy-mm-dd (required)
  to: string;
  metric: CumulativeMetric;
  accountId?: AccountModel['id'];
  excludeCategories?: boolean;
}

export interface CumulativeMonthData {
  month: number; // 1-12
  monthLabel: string; // "Jan", "Feb", etc.
  value: number; // cumulative value up to this month
  periodValue: number; // value for just this month
}

export interface CumulativePeriodData {
  year: number; // Year from the period start date (for reference)
  data: CumulativeMonthData[];
  total: number;
}

export interface GetCumulativeResponse {
  currentPeriod: CumulativePeriodData;
  previousPeriod: CumulativePeriodData;
  percentChange: number; // Period-over-period total change %
}
