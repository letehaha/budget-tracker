import {
  ACCOUNT_CATEGORIES,
  ACCOUNT_TYPES,
  CATEGORIZATION_SOURCE,
  CATEGORY_TYPES,
  PAYMENT_TYPES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
} from './enums';

export interface UserModel {
  id: number;
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  middleName: string;
  avatar: string;
  totalBalance: number;
  defaultCategoryId: number;
  isAdmin?: boolean;
}

export interface CategoryModel {
  color: string;
  id: number;
  imageUrl: null | string;
  name: string;
  parentId: null | number;
  type: CATEGORY_TYPES;
  userId: number;
}

/**
 * Known structure for account externalData field.
 * This is a JSONB field that can contain additional custom data.
 */
export interface AccountExternalData {
  /** Bank connection linking metadata (for linked system accounts) */
  bankConnection?: {
    linkedAt: string; // ISO date string
    linkingStrategy: 'forward-only' | 'full-reconciliation';
    balanceReconciliation: {
      systemBalance: number;
      externalBalance: number;
      difference: number;
      adjustmentTransactionId: number | null;
    };
  };
  // Allow any additional custom fields
  [key: string]: unknown;
}

export interface AccountModel {
  type: ACCOUNT_TYPES;
  id: number;
  name: string;
  initialBalance: number;
  refInitialBalance: number;
  currentBalance: number;
  refCurrentBalance: number;
  creditLimit: number;
  refCreditLimit: number;
  accountCategory: ACCOUNT_CATEGORIES;
  currencyCode: string;
  userId: number;
  externalId?: string;
  externalData?: AccountExternalData | null;
  isEnabled: boolean;
  bankDataProviderConnectionId?: number;
}

/**
 * Account model with computed `needsRelink` flag.
 * Used in API responses where the backend computes whether an Enable Banking
 * account needs to be re-linked due to schema migration (externalId was uid,
 * now should be identification_hash).
 */
export interface AccountWithRelinkStatus extends AccountModel {
  needsRelink: boolean;
}

export interface BalanceModel {
  id: number;
  date: Date;
  amount: number;
  accountId: number;
  account: Omit<AccountModel, 'systemType'>;
}

/**
 * Metadata about how a transaction was categorized.
 * Stored as JSONB in the database.
 */
export interface CategorizationMeta {
  source: CATEGORIZATION_SOURCE;
  /** Rule ID for user_rule categorization */
  ruleId?: number;
  /** ISO timestamp when categorization was applied */
  categorizedAt?: string;
}

export interface TransactionModel {
  id: number;
  amount: number;
  // Amount in base currency
  refAmount: number;
  note: string;
  time: Date;
  userId: number;
  transactionType: TRANSACTION_TYPES;
  paymentType: PAYMENT_TYPES;
  accountId: number;
  categoryId: number;
  currencyCode: string;
  accountType: ACCOUNT_TYPES;
  refCurrencyCode: string;

  // is transaction transfer?
  transferNature: TRANSACTION_TRANSFER_NATURE;
  // (hash, used to connect two transactions)
  transferId: string;

  originalId: string; // Stores the original id from external source
  externalData: object; // JSON of any addition fields
  // balance: number;
  // hold: boolean;
  // receiptId: string;
  commissionRate: number; // should be comission calculated as refAmount
  refCommissionRate: number; // should be comission calculated as refAmount
  cashbackAmount: number; // add to unified
  refundLinked: boolean;
  /** Metadata about how this transaction was categorized */
  categorizationMeta?: CategorizationMeta | null;
}

export interface CurrencyModel {
  currency: string;
  digits: number;
  number: number;
  code: string;
  isDisabled: boolean;
}

export interface UserCurrencyModel {
  id: number;
  userId: number;
  currencyCode: string;
  exchangeRate: number;
  liveRateUpdate: boolean;
  isDefaultCurrency: boolean;
  currency?: CurrencyModel;
  user?: UserModel;
}

export interface ExchangeRatesModel {
  baseCode: string;
  quoteCode: string;
  rate: number;
}

export interface UserExchangeRatesModel extends ExchangeRatesModel {
  userId: number;
  custom?: boolean;
}

export interface BudgetModel {
  id: number;
  userId: number;
  status: string;
  name: string;
  startDate?: Date;
  endDate?: Date;
  limitAmount?: number;
  autoInclude?: boolean;
}
