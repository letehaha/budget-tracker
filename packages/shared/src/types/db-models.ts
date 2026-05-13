import {
  ACCOUNT_CATEGORIES,
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  BANK_PROVIDER_TYPE,
  BUDGET_TYPES,
  CATEGORIZATION_SOURCE,
  CATEGORY_TYPES,
  NotificationPriority,
  NotificationStatus,
  NotificationType,
  PAYMENT_TYPES,
  PaymentReminderStatus,
  RemindBeforePreset,
  ResourceType,
  SharePermission,
  ShareInvitationStatus,
  SUBSCRIPTION_CANDIDATE_STATUS,
  SUBSCRIPTION_FREQUENCIES,
  SUBSCRIPTION_LINK_STATUS,
  SUBSCRIPTION_MATCH_SOURCE,
  SUBSCRIPTION_TYPES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  TagReminderFrequency,
  TagReminderType,
  TransactionsWriteScope,
  UserRole,
} from './enums';

export interface UserModel {
  id: number;
  username: string;
  email: string;
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
  /**
   * Stable, locale-independent identifier for seeded default categories (kebab-case).
   * Null for user-created categories.
   */
  key: null | string;
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

/**
 * Account share block (PRD F14). Present on every user-facing list/detail account
 * response — describes whether the requester owns the account or accesses it via an
 * accepted share, plus the owner's display info.
 */
export interface AccountShareInfo {
  isOwner: boolean;
  owner: {
    id: number;
    username: string;
    avatar: string | null;
  };
  permission: SharePermission;
  policy: SharePolicy | null;
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
  status: ACCOUNT_STATUSES;
  excludeFromStats: boolean;
  bankDataProviderConnectionId?: number;
  /**
   * Provider type denormalized from the connection so the account list / card can render
   * the bank logo without a per-account `GET /connections/:id` round-trip. Safe to expose
   * to share recipients (who can't reach the owner-scoped connection-details endpoint).
   */
  bankProviderType?: BANK_PROVIDER_TYPE | null;
  /** Present on user-facing list/detail responses; absent on internal serializations. */
  share?: AccountShareInfo;
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

/**
 * Frozen identity of a transaction's original creator. Populated only when the creator's
 * Users row is being deleted — at that point we copy the last-known username/avatar before
 * the FK SET NULL nulls `Transactions.userId`. Lets the frontend render
 * "alice (deleted)" on shared-account transactions whose creator is gone instead of
 * an anonymous "Unknown user" placeholder.
 */
export interface TransactionCreatorSnapshot {
  userId: number;
  username: string;
  avatar: string | null;
}

export interface TransactionModel {
  id: number;
  amount: number;
  // Amount in base currency
  refAmount: number;
  note: string;
  time: Date;
  userId: number;
  /** See `TransactionCreatorSnapshot`. NULL on every row except when the creator's
   *  account is deleted; backfill is intentionally skipped (no historical
   *  user-deletes are retroactively recoverable). */
  creatorSnapshot: TransactionCreatorSnapshot | null;
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
  /** Transaction groups this transaction belongs to (loaded when includeGroups=true) */
  transactionGroups?: Array<{ id: number; name: string }>;
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

/**
 * Common metadata about a share-related notification's owner / recipient pair.
 * The recipient's perspective uses `owner` fields; the owner's perspective uses `recipient` fields.
 */
export interface ShareInvitationNotificationPayload {
  invitationId: string;
  /** Single-use token used to deep-link to the accept/decline page (`/shared-with-me/invitations/:token`).
   * Required so the frontend notification handler can navigate without an extra lookup. */
  token: string;
  /** Reusable across notification types: 'account', 'budget', etc. */
  resourceType: ResourceType;
  /** String-encoded resource id, matches `ResourceShares.resourceId` shape. */
  resourceId: string;
  /** Resource display label captured at notification time (e.g., account name). */
  resourceName: string;
  permission: SharePermission;
  /** Sender's display info, denormalized so notification list doesn't N+1. */
  owner: {
    id: number;
    username: string;
    avatar: string | null;
  };
  /** ISO timestamp when the invitation expires (only for `share_invitation_received`). */
  expiresAt?: string;
}

export interface ShareLifecycleNotificationPayload {
  shareId?: string;
  invitationId?: string;
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
  permission?: SharePermission;
  /** The other party in the share — recipient (for owner-side notifications) or owner (for recipient-side). */
  counterpartUser: {
    id: number;
    username: string;
    avatar: string | null;
  };
}

/**
 * Owner-side notification fired when the inline Resend email for an invitation rejected
 * or errored after the DB row was already committed. The invitation stays in `pending` —
 * this surfaces the delivery failure as a durable record so the owner can resend from the
 * UI without having to remember the API response.
 */
export interface ShareInvitationSendFailedPayload {
  invitationId: string;
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
  inviteeEmail: string;
  /** Present when the invitee resolved to a registered user. `null` otherwise. */
  inviteeSnapshot: {
    id: number;
    username: string;
    avatar: string | null;
  } | null;
}

export type NotificationPayload =
  | BudgetAlertPayload
  | SystemNotificationPayload
  | ChangelogNotificationPayload
  | TagReminderNotificationPayload
  | ShareInvitationNotificationPayload
  | ShareLifecycleNotificationPayload
  | ShareInvitationSendFailedPayload
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

export interface SubscriptionCandidateModel {
  id: string;
  userId: number;
  suggestedName: string;
  detectedFrequency: SUBSCRIPTION_FREQUENCIES;
  /** Average amount in cents */
  averageAmount: number;
  currencyCode: string;
  accountId: number | null;
  sampleTransactionIds: number[];
  occurrenceCount: number;
  confidenceScore: number;
  medianIntervalDays: number;
  status: SUBSCRIPTION_CANDIDATE_STATUS;
  subscriptionId: string | null;
  detectedAt: Date;
  lastOccurrenceAt: Date | null;
  resolvedAt: Date | null;
}

export interface PaymentReminderModel {
  id: string;
  userId: number;
  subscriptionId: string | null;
  name: string;
  /** Amount in cents, null means no expected amount */
  expectedAmount: number | null;
  currencyCode: string | null;
  /** null = one-off reminder */
  frequency: SUBSCRIPTION_FREQUENCIES | null;
  /** Anchor day for recurring reminders (1-31). Derived from initial dueDate. */
  anchorDay: number;
  dueDate: string;
  remindBefore: RemindBeforePreset[];
  notifyEmail: boolean;
  /** Hour slot for notifications in user's timezone (0, 4, 8, 12, 16, 20) */
  preferredTime: number;
  /** IANA timezone string */
  timezone: string;
  categoryId: number | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentReminderPeriodModel {
  id: string;
  reminderId: string;
  dueDate: string;
  status: PaymentReminderStatus;
  paidAt: Date | null;
  transactionId: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentReminderNotificationModel {
  id: string;
  periodId: string;
  remindBeforePreset: RemindBeforePreset;
  sentAt: Date;
  emailSent: boolean;
  emailError: string | null;
}

/**
 * Granular policy overrides on top of a `permission` for a `ResourceShare`.
 * Stored as JSONB. All fields optional; missing fields fall back to defaults.
 *
 * Phase 1 supports:
 * - `transactionsWriteScope` (only meaningful when permission is write/manage and
 *   resourceType is 'account'; default is 'all').
 */
export interface SharePolicy {
  transactionsWriteScope?: TransactionsWriteScope;
}

/**
 * Active access grant: user X may use resource Y at a given permission level.
 * Inactive (acceptedAt IS NULL) until the recipient accepts the invitation.
 */
export interface ResourceShareModel {
  id: string;
  ownerUserId: number;
  sharedWithUserId: number;
  resourceType: ResourceType;
  /** String-encoded resource id (handles INTEGER and UUID-keyed resources uniformly). */
  resourceId: string;
  permission: SharePermission;
  policy: SharePolicy | null;
  acceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Pending offer to share a resource. Distinct from `ResourceShareModel` because
 * invitations may expire, be declined, or be revoked before acceptance, and we
 * want a separate audit trail.
 */
export interface ShareInvitationModel {
  id: string;
  ownerUserId: number;
  inviteeEmail: string;
  /**
   * Resolved at invitation creation time when the email matches a registered user.
   * Kept nullable for Phase 5 forward-compatibility (auto-signup-from-invite).
   */
  inviteeUserId: number | null;
  resourceType: ResourceType;
  resourceId: string;
  permission: SharePermission;
  policy: SharePolicy | null;
  /** URL-safe random token used in accept/decline links. */
  token: string;
  status: ShareInvitationStatus;
  expiresAt: Date;
  acceptedAt: Date | null;
  declinedAt: Date | null;
  revokedAt: Date | null;
  /** Lifetime resend counter (audit). Bumped on every resend, never reset. */
  resendCount: number;
  /** ISO timestamps for resends within the rolling 24h rate-limit window. Pruned in-app on each resend. */
  recentResendsAt: string[];
  createdAt: Date;
  updatedAt: Date;
}
