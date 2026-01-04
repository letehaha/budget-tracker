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
}

/**
 * Supported bank data provider types
 */
export enum BANK_PROVIDER_TYPE {
  MONOBANK = 'monobank',
  ENABLE_BANKING = 'enable-banking',
  // Future providers will be added here:
  // GOCARDLESS = 'gocardless',
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
}

export enum BUDGET_STATUSES {
  active = 'active',
  closed = 'closed',
}

/**
 * Source of transaction categorization
 */
export enum CATEGORIZATION_SOURCE {
  manual = 'manual',
  ai = 'ai',
  mccRule = 'mcc_rule',
  userRule = 'user_rule',
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
