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

export enum ACCOUNT_STATUSES {
  active = 'active',
  archived = 'archived',
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

export enum FILTER_OPERATION {
  all = 'all',
  exclude = 'exclude',
  only = 'only',
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
  paymentReminder: 'payment_reminder',
  shareInvitationReceived: 'share_invitation_received',
  shareAccepted: 'share_accepted',
  shareDeclined: 'share_declined',
  shareRevoked: 'share_revoked',
  shareLeft: 'share_left',
  shareExpired: 'share_expired',
  shareOwnerAccountDeleted: 'share_owner_account_deleted',
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

/**
 * Payment reminder period statuses
 */
export const PAYMENT_REMINDER_STATUSES = {
  upcoming: 'upcoming',
  overdue: 'overdue',
  paid: 'paid',
  skipped: 'skipped',
} as const;

export type PaymentReminderStatus = (typeof PAYMENT_REMINDER_STATUSES)[keyof typeof PAYMENT_REMINDER_STATUSES];

/**
 * Fixed "remind before" presets for payment reminders.
 * Up to 3 can be selected per reminder.
 */
export const REMIND_BEFORE_PRESETS = {
  oneDay: '1_day',
  twoDays: '2_days',
  threeDays: '3_days',
  fiveDays: '5_days',
  oneWeek: '1_week',
  twoWeeks: '2_weeks',
  oneMonth: '1_month',
} as const;

export type RemindBeforePreset = (typeof REMIND_BEFORE_PRESETS)[keyof typeof REMIND_BEFORE_PRESETS];

/** Map presets to number of days for calculation */
export const REMIND_BEFORE_DAYS: Record<RemindBeforePreset, number> = {
  '1_day': 1,
  '2_days': 2,
  '3_days': 3,
  '5_days': 5,
  '1_week': 7,
  '2_weeks': 14,
  '1_month': 30,
};

/** Maximum number of remind-before presets per reminder */
export const MAX_REMIND_BEFORE_PRESETS = 3;

/** Allowed hour slots for reminder notification time */
export const PREFERRED_TIME_SLOTS = [0, 4, 8, 12, 16, 20] as const;
export type PreferredTimeSlot = (typeof PREFERRED_TIME_SLOTS)[number];

/**
 * Resource types that can be shared with other users.
 * Phase 1 supports only `account`. New types are added in later phases.
 */
export const RESOURCE_TYPES = {
  account: 'account',
} as const;

export type ResourceType = (typeof RESOURCE_TYPES)[keyof typeof RESOURCE_TYPES];

/**
 * Permission levels granted on a shared resource.
 * - read: view the resource and its child entities
 * - write: read + create/update/delete child entities (subject to policy)
 * - manage: write + manage other recipients of the same resource (cannot delete the resource itself)
 */
export const SHARE_PERMISSIONS = {
  read: 'read',
  write: 'write',
  manage: 'manage',
} as const;

export type SharePermission = (typeof SHARE_PERMISSIONS)[keyof typeof SHARE_PERMISSIONS];

/**
 * Status of a share invitation.
 */
export const SHARE_INVITATION_STATUSES = {
  pending: 'pending',
  accepted: 'accepted',
  declined: 'declined',
  revoked: 'revoked',
  expired: 'expired',
} as const;

export type ShareInvitationStatus = (typeof SHARE_INVITATION_STATUSES)[keyof typeof SHARE_INVITATION_STATUSES];

/**
 * Scope of write access for transactions on a shared account.
 * - all: can edit/delete any transaction on the shared account
 * - own: can edit/delete only transactions the recipient created
 *
 * Stored on `ResourceShares.policy.transactionsWriteScope` when `resourceType = 'account'`.
 */
export const TRANSACTIONS_WRITE_SCOPES = {
  all: 'all',
  own: 'own',
} as const;

export type TransactionsWriteScope = (typeof TRANSACTIONS_WRITE_SCOPES)[keyof typeof TRANSACTIONS_WRITE_SCOPES];

/**
 * Hardcoded sharing-related limits. Bumping these is a code-only change.
 *
 * `maxRecipientsPerResource` is the cap for Phase 1 free tier; lifts to 50 once a
 * paid tier exists. Counts only accepted shares (recipients), not pending invitations.
 *
 * `maxPendingInvitationsPerResource` caps how many concurrent pending invitations a
 * single owner can have for one resource. The smaller test value keeps the relevant
 * boundary cheap to exercise in e2e tests; the dev/prod value is the real abuse-prevention
 * limit (per-recipient resend rate-limiting in S6 is the dedicated spam guard).
 *
 * Backend reads this via `getMaxPendingInvitationsPerResource()` in
 * `services/sharing/limits.ts` so the test override is centralized.
 */
export const SHARING_LIMITS = {
  maxRecipientsPerResource: 2,
  maxPendingInvitationsPerResource: 10,
  maxPendingInvitationsPerResourceTest: 3,
  invitationExpirationDays: 7,
  // 32 random bytes encoded as base64url → exactly 43 ASCII chars (see generate-invitation-token.ts).
  invitationTokenLength: 43,
  resendPerInviteeRateLimit: { count: 3, windowMs: 24 * 60 * 60 * 1000 },
} as const;
