import { AccountModel, CategoryModel, MonobankUserModel, TransactionModel, UserModel } from './db-models';
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

export interface AuthLoginBody extends BodyPayload {
  username: string;
  password: string;
}
// Bearer token
export interface AuthLoginResponse {
  token: string;
}

export interface AuthRegisterBody extends BodyPayload {
  username: string;
  password: string;
}
export interface AuthRegisterResponse {
  user: UserModel;
}

export interface PairMonobankAccountBody extends BodyPayload {
  token: MonobankUserModel['apiToken'];
}

export interface UpdateMonobankUserBody extends BodyPayload {
  apiToken?: MonobankUserModel['apiToken'];
  name?: MonobankUserModel['name'];
  webHookUrl?: MonobankUserModel['webHookUrl'];
  clientId?: MonobankUserModel['clientId'];
}

export interface LoadMonoTransactionsQuery extends QueryPayload {
  from: number;
  to: number;
  accountId: number;
}
export interface LoadMonoTransactionsResponse {
  minutesToFinish: number;
}

export interface UpdateWebhookBody extends BodyPayload {
  clientId: string;
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
  // Pass tx ids that will refund the source tx
  refundedByTxIds?: number[] | null;
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
