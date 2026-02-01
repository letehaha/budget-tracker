import {
  ACCOUNT_CATEGORIES,
  ACCOUNT_TYPES,
  BUDGET_TYPES,
  CATEGORIZATION_SOURCE,
  CATEGORY_TYPES,
  NotificationPriority,
  NotificationStatus,
  NotificationType,
  PAYMENT_TYPES,
  SUBSCRIPTION_FREQUENCIES,
  SUBSCRIPTION_LINK_STATUS,
  SUBSCRIPTION_MATCH_SOURCE,
  SUBSCRIPTION_TYPES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  TagReminderFrequency,
  TagReminderType,
  UserRole,
} from './enums';

export interface UserModel {
  id: number;
  username: string;
  email: string;
  password?: string;
  firstName: string;
  lastName: string;
  middleName: string;
  avatar: string;
  totalBalance: number;
  defaultCategoryId: number;
  authUserId?: string;
  /** User role for access control. Defaults to 'common' for regular users. */
  role: UserRole;
  /** @deprecated Use role === 'admin' instead */
  isAdmin?: boolean;
}

export interface CategoryModel {
  color: string;
  id: number;
  icon: null | string;
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
  /** Subscription ID for subscription_rule categorization */
  subscriptionId?: string;
  /** ISO timestamp when categorization was applied */
  categorizedAt?: string;
}

export interface TransactionSplitModel {
  id: string;
  transactionId: number;
  userId: number;
  categoryId: number;
  amount: number;
  refAmount: number;
  note: string | null;
  category?: CategoryModel;
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
  /** Optional splits for multi-category transactions */
  splits?: TransactionSplitModel[];
  /** Optional tags associated with the transaction (loaded when includeTags=true) */
  tags?: TagModel[];
  /** Timestamp when the record was created (defaults to transaction time for existing records) */
  createdAt: Date;
  /** Timestamp when the record was last updated */
  updatedAt: Date;
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
  type: BUDGET_TYPES;
  startDate?: Date;
  endDate?: Date;
  limitAmount?: number;
  autoInclude?: boolean;
  /**
   * Category IDs for category-based budgets.
   * Use for CREATE/UPDATE requests - the backend will expand parent IDs to include children.
   * Not populated in GET responses (use `categories` array instead).
   */
  categoryIds?: number[];
  /**
   * Full category objects for category-based budgets.
   * Populated in GET responses when budget has associated categories.
   * Read-only - for mutations, use `categoryIds`.
   */
  categories?: CategoryModel[];
}

export interface TagModel {
  id: number;
  userId: number;
  name: string;
  color: string;
  icon: string | null;
  description: string | null;
  createdAt: Date;
  /** Count of reminders associated with this tag (populated on list fetch) */
  remindersCount?: number;
}

/**
 * Type-specific settings for amount threshold reminders
 */
export interface AmountThresholdSettings {
  /** Threshold amount in cents */
  amountThreshold: number;
}

export type TagReminderSettings = AmountThresholdSettings | Record<string, unknown>;

export interface TagReminderModel {
  id: number;
  userId: number;
  tagId: number;
  type: TagReminderType;
  /** Frequency preset. Null means real-time trigger (immediate when tagged) */
  frequency: TagReminderFrequency | null;
  /** Day of month to check (1-31). Only used for monthly/quarterly/yearly. Null = 1st */
  dayOfMonth: number | null;
  /** Type-specific settings (e.g., amountThreshold for amount_threshold type) */
  settings: TagReminderSettings;
  isEnabled: boolean;
  lastCheckedAt: Date | null;
  lastTriggeredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Type-specific payload structures for notifications.
 * Using discriminated union pattern for type safety.
 */
export interface BudgetAlertPayload {
  budgetId: number;
  budgetName: string;
  thresholdPercent: number;
  currentSpent: number;
  limitAmount: number;
  currencyCode: string;
}

export interface SystemNotificationPayload {
  code?: string;
  details?: Record<string, unknown>;
}

export interface ChangelogNotificationPayload {
  version: string;
  releaseName: string;
  releaseUrl: string;
  releaseDate: string;
}

export interface TagReminderNotificationPayload {
  tagId: number;
  tagName: string;
  tagColor?: string | null;
  tagIcon?: string | null;
  reminderType: TagReminderType;
  /** Schedule info for context in notification */
  schedule?: {
    frequency?: TagReminderFrequency | null;
    dayOfMonth?: number | null;
  };
  /** Amount threshold in cents (integers) */
  thresholdAmount?: number;
  /** Actual amount spent in cents (integers) */
  actualAmount?: number;
  transactionCount?: number;
  currencyCode?: string;
  /** IDs of transactions that triggered this reminder */
  transactionIds?: number[];
}

export type NotificationPayload =
  | BudgetAlertPayload
  | SystemNotificationPayload
  | ChangelogNotificationPayload
  | TagReminderNotificationPayload
  | Record<string, unknown>;

export interface NotificationModel {
  id: string;
  userId: number;
  type: NotificationType;
  title: string;
  message: string | null;
  payload: NotificationPayload;
  status: NotificationStatus;
  priority: NotificationPriority;
  createdAt: Date;
  readAt: Date | null;
  expiresAt: Date | null;
}

/**
 * Matching rule for subscription auto-matching.
 * Rules are evaluated with AND logic (all must pass).
 */
export interface SubscriptionMatchingRule {
  field: 'note' | 'amount' | 'transactionType' | 'accountId';
  operator: 'contains_any' | 'between' | 'equals';
  value: string[] | { min: number; max: number } | string | number;
  /** Currency code for amount rules (enables cross-currency matching) */
  currencyCode?: string;
}

export interface SubscriptionMatchingRules {
  rules: SubscriptionMatchingRule[];
}

export interface SubscriptionModel {
  id: string;
  userId: number;
  name: string;
  type: SUBSCRIPTION_TYPES;
  /** Expected amount in cents */
  expectedAmount: number | null;
  expectedCurrencyCode: string | null;
  frequency: SUBSCRIPTION_FREQUENCIES;
  startDate: string;
  endDate: string | null;
  accountId: number | null;
  categoryId: number | null;
  matchingRules: SubscriptionMatchingRules;
  isActive: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionTransactionModel {
  subscriptionId: string;
  transactionId: number;
  matchSource: SUBSCRIPTION_MATCH_SOURCE;
  matchedAt: Date;
  status: SUBSCRIPTION_LINK_STATUS;
}
