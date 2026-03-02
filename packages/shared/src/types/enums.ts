/**
 * User roles for access control and feature gating.
 * - admin: Full access to all features including admin panel
 * - common: Regular registered user
 * - demo: Temporary demo user (auto-deleted after 6 hours)
 */
export const USER_ROLES = {
  admin: 'admin',
  common: 'common',
  demo: 'demo',
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

/**
 * Supported OAuth providers for authentication
 */
export enum OAUTH_PROVIDER {
  google = 'google',
  github = 'github',
}

// Array of all providers for iteration (e.g., trustedProviders config)
export const OAUTH_PROVIDERS_LIST = Object.values(OAUTH_PROVIDER);

export enum ACCOUNT_TYPES {
  system = 'system',
  monobank = 'monobank', // monobank provider connection
  enableBanking = 'enable-banking', // enable-banking provider connection
  lunchflow = 'lunchflow', // lunchflow provider connection
  walutomat = 'walutomat', // walutomat provider connection
}

/**
 * Supported bank data provider types
 */
export enum BANK_PROVIDER_TYPE {
  MONOBANK = 'monobank',
  ENABLE_BANKING = 'enable-banking',
  LUNCHFLOW = 'lunchflow',
  WALUTOMAT = 'walutomat',
}

export enum ACCOUNT_CATEGORIES {
  general = 'general',
  cash = 'cash',
  currentAccount = 'current-account',
  creditCard = 'credit-card',
  saving = 'saving',
  bonus = 'bonus',
  insurance = 'insurance',
  investment = 'investment',
  loan = 'loan',
  mortgage = 'mortgage',
  overdraft = 'overdraft',
  crypto = 'crypto',
}

export enum PAYMENT_TYPES {
  bankTransfer = 'bankTransfer',
  voucher = 'voucher',
  webPayment = 'webPayment',
  cash = 'cash',
  mobilePayment = 'mobilePayment',
  creditCard = 'creditCard',
  debitCard = 'debitCard',
}

export enum SORT_DIRECTIONS {
  asc = 'ASC',
  desc = 'DESC',
}

export enum TRANSACTION_TYPES {
  income = 'income',
  expense = 'expense',
}

export enum CATEGORY_TYPES {
  custom = 'custom',
  // internal means that it cannot be deleted or edited
  internal = 'internal',
}

// Stored like that in the DB as well
export enum TRANSACTION_TRANSFER_NATURE {
  not_transfer = 'not_transfer',
  common_transfer = 'transfer_between_user_accounts',
  transfer_out_wallet = 'transfer_out_wallet',
  transfer_to_portfolio = 'transfer_to_portfolio',
}

export enum BUDGET_STATUSES {
  active = 'active',
  closed = 'closed',
  archived = 'archived',
}

export enum BUDGET_TYPES {
  manual = 'manual',
  category = 'category',
}

/**
 * Tag reminder trigger types
 */
export const TAG_REMINDER_TYPES = {
  amountThreshold: 'amount_threshold',
  existenceCheck: 'existence_check',
} as const;

export type TagReminderType = (typeof TAG_REMINDER_TYPES)[keyof typeof TAG_REMINDER_TYPES];

/**
 * Tag reminder frequency presets
 */
export const TAG_REMINDER_FREQUENCIES = {
  daily: 'daily',
  weekly: 'weekly',
  monthly: 'monthly',
  quarterly: 'quarterly',
  yearly: 'yearly',
} as const;

export type TagReminderFrequency = (typeof TAG_REMINDER_FREQUENCIES)[keyof typeof TAG_REMINDER_FREQUENCIES];

/**
 * Special value for real-time/immediate reminders (no scheduled frequency).
 * Used in frontend forms to represent `null` frequency.
 */
export const TAG_REMINDER_IMMEDIATE = 'immediate' as const;

export type TagReminderFrequencyOrImmediate = TagReminderFrequency | typeof TAG_REMINDER_IMMEDIATE;

/**
 * Source of transaction categorization
 */
export enum CATEGORIZATION_SOURCE {
  manual = 'manual',
  ai = 'ai',
  mccRule = 'mcc_rule',
  userRule = 'user_rule',
  subscriptionRule = 'subscription_rule',
}

/**
 * Supported AI providers for features like transaction categorization
 */
export enum AI_PROVIDER {
  anthropic = 'anthropic',
  openai = 'openai',
  google = 'google',
  groq = 'groq',
}

/**
 * AI-powered features that can have individual model configurations
 */
export enum AI_FEATURE {
  categorization = 'categorization',
  statementParsing = 'statement_parsing',
  // Future features:
  // insights = 'insights',
  // budgetSuggestions = 'budget_suggestions',
  // receiptParsing = 'receipt_parsing',
}

/**
 * Known notification types. Using string literals (not enum) to allow
 * adding new types without migrations. These are the currently supported types.
 */
export const NOTIFICATION_TYPES = {
  budgetAlert: 'budget_alert',
  system: 'system',
  changelog: 'changelog',
  tagReminder: 'tag_reminder',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES] | string;

/**
 * Notification status
 */
export const NOTIFICATION_STATUSES = {
  unread: 'unread',
  read: 'read',
  dismissed: 'dismissed',
} as const;

export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[keyof typeof NOTIFICATION_STATUSES] | string;

/**
 * Notification priority levels
 */
export const NOTIFICATION_PRIORITIES = {
  low: 'low',
  normal: 'normal',
  high: 'high',
  urgent: 'urgent',
} as const;

export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[keyof typeof NOTIFICATION_PRIORITIES] | string;

/**
 * Subscription types
 */
export enum SUBSCRIPTION_TYPES {
  subscription = 'subscription',
  bill = 'bill',
}

/**
 * Subscription frequency presets
 */
export enum SUBSCRIPTION_FREQUENCIES {
  weekly = 'weekly',
  biweekly = 'biweekly',
  monthly = 'monthly',
  quarterly = 'quarterly',
  semiAnnual = 'semi_annual',
  annual = 'annual',
}

/**
 * Source of how a transaction was linked to a subscription
 */
export enum SUBSCRIPTION_MATCH_SOURCE {
  manual = 'manual',
  rule = 'rule',
  ai = 'ai',
}

/**
 * Status of a subscription–transaction link
 */
export enum SUBSCRIPTION_LINK_STATUS {
  active = 'active',
  unlinked = 'unlinked',
}

/**
 * Status of a subscription candidate (auto-detected recurring pattern)
 */
export enum SUBSCRIPTION_CANDIDATE_STATUS {
  pending = 'pending',
  accepted = 'accepted',
  dismissed = 'dismissed',
}
