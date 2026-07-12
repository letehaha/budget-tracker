import {
  ACCOUNT_CATEGORIES,
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  AccessSource,
  BANK_PROVIDER_TYPE,
  BUDGET_TYPES,
  CATEGORIZATION_MODE,
  LogoResolutionState,
  CATEGORIZATION_SOURCE,
  CATEGORY_TYPES,
  LOAN_TYPE,
  NotificationPriority,
  NotificationStatus,
  NotificationType,
  PAYMENT_TYPES,
  RemindBeforePreset,
  ResourceType,
  SharePermission,
  ShareInvitationStatus,
  SUBSCRIPTION_CANDIDATE_STATUS,
  SUBSCRIPTION_FREQUENCIES,
  SUBSCRIPTION_LINK_STATUS,
  SUBSCRIPTION_MATCH_SOURCE,
  SUBSCRIPTION_PERIOD_STATUSES,
  SUBSCRIPTION_TYPES,
  SubscriptionPeriodStatus,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  TagReminderFrequency,
  TagReminderType,
  TransactionsWriteScope,
  UserRole,
} from './enums';
import { LoanEvent } from './loans';
import { RecordId } from './record-id';

export interface UserModel {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string;
  avatar: string;
  totalBalance: number;
  defaultCategoryId: RecordId;
  authUserId?: RecordId;
  /** User role for access control. Defaults to 'common' for regular users. */
  role: UserRole;
  /** @deprecated Use role === 'admin' instead */
  isAdmin?: boolean;
}

export interface CategoryModel {
  color: string;
  id: RecordId;
  icon: null | string;
  /**
   * Stable, locale-independent identifier for seeded default categories (kebab-case).
   * Null for user-created categories.
   */
  key: null | string;
  name: string;
  parentId: RecordId | null;
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
      adjustmentTransactionId: RecordId | null;
    };
  };
  // Allow any additional custom fields
  [key: string]: unknown;
}

/**
 * Resource share block emitted on user-facing list/detail responses for any shareable
 * resource (accounts, budgets, …). Describes whether the requester owns the resource
 * or accesses it via an accepted share, plus the owner's display info.
 *
 * `accessSource` tells the frontend which kind of grant is in effect so it can pick
 * the right label and management entry point: per-resource shares keep the "Shared
 * by X" affordances, while household membership routes users into Settings → Household
 * for management. (Budgets never carry `'household'` – they're explicit-share only –
 * but the union stays open so a future selective-share extension doesn't force a type
 * widening.)
 */
export interface ResourceShareInfo {
  isOwner: boolean;
  owner: {
    id: number;
    username: string;
    avatar: string | null;
  };
  permission: SharePermission;
  policy: SharePolicy | null;
  accessSource: AccessSource;
}

export interface AccountModel {
  type: ACCOUNT_TYPES;
  id: RecordId;
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
  externalId?: RecordId;
  status: ACCOUNT_STATUSES;
  excludeFromStats: boolean;
  bankDataProviderConnectionId?: RecordId;
  /**
   * Provider type denormalized from the connection so the account list / card can render
   * the bank logo without a per-account `GET /connections/:id` round-trip. Safe to expose
   * to share recipients (who can't reach the owner-scoped connection-details endpoint).
   */
  bankProviderType?: BANK_PROVIDER_TYPE | null;
  /** Present on user-facing list/detail responses; absent on internal serializations. */
  share?: ResourceShareInfo;
}

/**
 * Serialized account wire shape (DB → API): every monetary field is a decimal
 * (cents converted on the way out), `id`/`type`/`accountCategory` are plain
 * strings, and owner-only bank-link metadata is stripped for share recipients.
 * The single source of truth for both the backend serializer's return type and
 * the frontend loan/account response shapes, so the two can't drift.
 */
export interface AccountApiResponse {
  id: string;
  name: string;
  initialBalance: number;
  refInitialBalance: number;
  currentBalance: number;
  refCurrentBalance: number;
  creditLimit: number;
  refCreditLimit: number;
  type: string;
  accountCategory: string;
  currencyCode: string;
  userId: number;
  externalId: string | null;
  status: ACCOUNT_STATUSES;
  excludeFromStats: boolean;
  bankDataProviderConnectionId: string | null;
  /** Provider type denormalized from the connection so the frontend can render the
   *  bank logo without a per-account connection-details lookup (which is owner-scoped
   *  and unreachable for share recipients). */
  bankProviderType: BANK_PROVIDER_TYPE | null;
  needsRelink?: boolean;
  /** Present on user-facing list/detail responses; absent on internal serializations. */
  share?: ResourceShareInfo;
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
  id: RecordId;
  date: Date;
  amount: number;
  accountId: RecordId;
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
  subscriptionId?: RecordId;
  /** Payee ID for payee_rule categorization */
  payeeId?: RecordId;
  /** ISO timestamp when categorization was applied */
  categorizedAt?: string;
}

export interface TransactionSplitModel {
  id: RecordId;
  transactionId: RecordId;
  userId: number;
  categoryId: RecordId;
  amount: number;
  refAmount: number;
  note: string | null;
  category?: CategoryModel;
}

/**
 * Frozen identity of a transaction's original creator. Populated only when the creator's
 * Users row is being deleted – at that point we copy the last-known username/avatar before
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
  id: RecordId;
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
  accountId: RecordId;
  categoryId: RecordId;
  currencyCode: string;
  accountType: ACCOUNT_TYPES;
  refCurrencyCode: string;

  // is transaction transfer?
  transferNature: TRANSACTION_TRANSFER_NATURE;
  // (hash, used to connect two transactions)
  transferId: RecordId;

  originalId: string; // Stores the original id from external source
  externalData: object; // JSON of any addition fields
  // balance: number;
  // hold: boolean;
  // receiptId: RecordId;
  commissionRate: number; // should be comission calculated as refAmount
  refCommissionRate: number; // should be comission calculated as refAmount
  cashbackAmount: number; // add to unified
  refundLinked: boolean;
  /** Metadata about how this transaction was categorized */
  categorizationMeta?: CategorizationMeta | null;
  /** Linked Payee. Null when no Payee resolved (raw merchant missing/unmatched). */
  payeeId?: RecordId | null;
  /**
   * Stops background Payee auto-linking from touching this row.
   *
   * Two auto-linkers run on every bank sync: the inline matcher that reads
   * the raw merchant string, and a fuzzy post-sync pass that re-tries
   * unlinked rows against the user's Payees + aliases. Both filter on
   * `payeeLocked = false`, so locked rows are invisible to them.
   *
   * Flips to `true` automatically when the user assigns or clears the
   * Payee in the UI. Prevents the next sync from undoing manual edits.
   *
   * Example: user sets a tx to Payee "Netflix Premium". Bank re-syncs the
   * same row with merchant "NETFLIX.COM"; without the lock the matcher
   * would revert it to plain "Netflix".
   *
   * `(payeeLocked: true, payeeId: null)` is valid – means "user deliberately
   * chose no payee here; don't auto-link one." Lock does not affect user
   * edits, categorization rules, or any other column.
   */
  payeeLocked?: boolean;
  /** Optional splits for multi-category transactions */
  splits?: TransactionSplitModel[];
  /** Optional tags associated with the transaction (loaded when includeTags=true) */
  tags?: TagModel[];
  /** Transaction groups this transaction belongs to (loaded when includeGroups=true).
   *  transactionCount is the group's full membership size, independent of how many of the
   *  group's members are in the current fetch window. */
  transactionGroups?: Array<{ id: RecordId; name: string; transactionCount: number }>;
  /** Recipient who attached this tx to a shared budget. Present (possibly `null`) on
   *  budget-scoped tx fetches; absent elsewhere. `null` ⇒ owner-attached, no chip in
   *  the UI. Non-null ⇒ the budget recipient who clicked Attach for this row. */
  addedBy?: { id: number; username: string; avatar: string | null } | null;
  /** Whether the caller has write access to this row. Set by list endpoints so the UI
   *  can render an inert details dialog (vs an edit form) when the row is visible –
   *  typically via a budget share – but not editable. Absent on write-result payloads
   *  and internal fetches; absent ⇒ "unknown / fall back to opportunistic UI". */
  canEdit?: boolean;
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
  id: RecordId;
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
  id: RecordId;
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
  categoryIds?: string[];
  /**
   * Full category objects for category-based budgets.
   * Populated in GET responses when budget has associated categories.
   * Read-only - for mutations, use `categoryIds`.
   */
  categories?: CategoryModel[];
  /** Present on user-facing list/detail responses; absent on internal serializations. */
  share?: ResourceShareInfo;
}

export interface TagModel {
  id: RecordId;
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
  id: RecordId;
  userId: number;
  tagId: RecordId;
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
  budgetId: RecordId;
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
  tagId: RecordId;
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
  transactionIds?: string[];
}

/**
 * Common metadata about a share-related notification's owner / recipient pair.
 * The recipient's perspective uses `owner` fields; the owner's perspective uses `recipient` fields.
 */
export interface ShareInvitationNotificationPayload {
  invitationId: RecordId;
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
  shareId?: RecordId;
  invitationId?: RecordId;
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
  permission?: SharePermission;
  /** Present on permission-change notifications so the recipient's UI can render the active write scope. */
  policy?: SharePolicy | null;
  /** The other party in the share – recipient (for owner-side notifications) or owner (for recipient-side). */
  counterpartUser: {
    id: number;
    username: string;
    avatar: string | null;
  };
}

/**
 * Owner-side notification fired when the inline Resend email for an invitation rejected
 * or errored after the DB row was already committed. The invitation stays in `pending` –
 * this surfaces the delivery failure as a durable record so the owner can resend from the
 * UI without having to remember the API response.
 */
export interface ShareInvitationSendFailedPayload {
  invitationId: RecordId;
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
  id: RecordId;
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
  id: RecordId;
  userId: number;
  name: string;
  type: SUBSCRIPTION_TYPES;
  /** Expected billed amount as a decimal (e.g. 9.99). Persisted as cents internally. */
  expectedAmount: number | null;
  expectedCurrencyCode: string | null;
  frequency: SUBSCRIPTION_FREQUENCIES;
  startDate: string;
  endDate: string | null;
  accountId: RecordId | null;
  categoryId: RecordId | null;
  matchingRules: SubscriptionMatchingRules;
  isActive: boolean;
  notes: string | null;
  /** Rolling next payment date. Null until a period-payment schedule is configured. */
  dueDate: string | null;
  /** Day-of-month (1-31) preserved from the initial dueDate for month-end clamping. */
  anchorDay: number | null;
  /** Installment cap: stop generating periods after this many. Null = indefinite. */
  maxOccurrences: number | null;
  /** When an installment consumed its full schedule it is marked finished here and
   *  deactivated. Null for open installments and for subscriptions/bills, which never
   *  complete. Distinguishes a finished installment from a manually paused one (both
   *  carry isActive=false). */
  completedAt: Date | null;
  /** Whether this subscription appears in the dashboard "Subscriptions & Bills" widget. */
  showInWidget: boolean;
  /** When true, the hourly auto-record cron books the expense for the next due
   *  period and marks it paid. Requires accountId + expectedAmount + expectedCurrencyCode.
   *  Mutually exclusive with `matchingRules.rules` (both routes would race). */
  autoRecord: boolean;
  /** JSONB array of RemindBeforePreset strings. Empty array means no advance notifications. */
  remindBefore: RemindBeforePreset[];
  notifyEmail: boolean;
  /** Resolved brand domain used to fetch the logo (e.g. "netflix.com"). Null
   *  when the brand resolver has not yet matched this subscription, or when the
   *  user explicitly cleared the logo (paired with logoSource 'manual'). */
  logoDomain: string | null;
  /** How logoDomain was resolved – see LogoResolutionState. 'manual' can pair
   *  with a null logoDomain (user explicitly cleared the logo); null only before
   *  the subscription has been through a resolution pass. */
  logoSource: LogoResolutionState;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionPeriodModel {
  id: RecordId;
  subscriptionId: RecordId;
  dueDate: string;
  status: SubscriptionPeriodStatus;
  paidAt: Date | null;
  transactionId: RecordId | null;
  /** True when `transactionId` was generated by the app (CREATE-mode pay) vs. linked by the user. */
  transactionAutoCreated: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionTransactionModel {
  subscriptionId: RecordId;
  transactionId: RecordId;
  matchSource: SUBSCRIPTION_MATCH_SOURCE;
  matchedAt: Date;
  status: SUBSCRIPTION_LINK_STATUS;
}

export interface SubscriptionCandidateModel {
  id: RecordId;
  userId: number;
  suggestedName: string;
  detectedFrequency: SUBSCRIPTION_FREQUENCIES;
  /** Average amount in cents */
  averageAmount: number;
  currencyCode: string;
  accountId: RecordId | null;
  sampleTransactionIds: string[];
  occurrenceCount: number;
  confidenceScore: number;
  medianIntervalDays: number;
  status: SUBSCRIPTION_CANDIDATE_STATUS;
  subscriptionId: RecordId | null;
  detectedAt: Date;
  lastOccurrenceAt: Date | null;
  resolvedAt: Date | null;
}

export interface SubscriptionPeriodNotificationModel {
  id: RecordId;
  periodId: RecordId;
  remindBeforePreset: RemindBeforePreset;
  sentAt: Date;
  emailSent: boolean;
  emailError: string | null;
}

/**
 * Granular policy overrides on top of a `permission` for a `ResourceShare`.
 * Stored as JSONB. All fields optional; missing fields fall back to defaults.
 *
 * - `transactionsWriteScope`: applies whenever a transaction mutation runs
 *   against an account the caller does not own. Default is `'all'`. Meaningful
 *   on both `account` rows (write/manage scope on that one account) and
 *   `household` rows (write scope across every account the grantor owns).
 *   Household rows never store `'manage'` permission (enforced by a DB CHECK
 *   constraint), so the field is read alongside `permission = 'write'`.
 */
export interface SharePolicy {
  transactionsWriteScope?: TransactionsWriteScope;
}

/**
 * Active access grant: user X may use resource Y at a given permission level.
 * Inactive (acceptedAt IS NULL) until the recipient accepts the invitation.
 */
export interface ResourceShareModel {
  id: RecordId;
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
  id: RecordId;
  ownerUserId: number;
  inviteeEmail: string;
  /**
   * Resolved at invitation creation time when the email matches a registered
   * user. Kept nullable for forward-compatibility with auto-signup-from-invite.
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

export interface PayeeAliasModel {
  id: RecordId;
  payeeId: RecordId;
  rawName: string;
  normalizedName: string;
  /**
   * True when this alias's normalizedName equals the owning Payee's canonical
   * normalizedName. The canonical alias cannot be deleted (the API rejects
   * with 422) – clients should hide the delete affordance instead of
   * re-deriving normalization rules.
   */
  isCanonical: boolean;
  createdAt: Date;
}

/**
 * `details` payload on 409 responses from payee name/alias writes (create
 * payee, rename, create alias, add ignored name) when the submitted name
 * already resolves to a different Payee in the user's namespace.
 */
export interface PayeeNameConflictDetails {
  conflictingPayee: {
    id: RecordId;
    name: string;
  };
}

export interface PayeeModel {
  id: RecordId;
  userId: number;
  name: string;
  normalizedName: string;
  defaultCategoryId: RecordId | null;
  /** Controls how strongly `defaultCategoryId` applies during create-tx –
   *  see CATEGORIZATION_MODE in enums.ts for semantics. */
  categorizationMode: CATEGORIZATION_MODE;
  /**
   * Tags auto-applied to transactions linked to this Payee at creation/sync
   * time (skipped when the caller supplies an explicit tag list). Empty array
   * means no tag rule.
   */
  defaultTagIds: RecordId[];
  /** Resolved brand domain used to fetch the logo (e.g. "amazon.com"). Null
   *  when the brand resolver has not yet matched this Payee. */
  logoDomain: string | null;
  /** How logoDomain was resolved – see LogoResolutionState. 'manual' can pair
   *  with a null logoDomain (user explicitly cleared the logo); null only before
   *  the Payee has been through a resolution pass. */
  logoSource: LogoResolutionState;
  createdAt: Date;
  updatedAt: Date;
  aliases?: PayeeAliasModel[];
  defaultCategory?: CategoryModel | null;
}

/**
 * Stats aggregated at query time from `Transactions` for a Payee. Not stored –
 * computed from the `(userId, payeeId, time DESC)` index. Signed `netFlowRef`
 * works naturally for both income and expense Payees (income positive, expense
 * negative) and is reported in the user's ref currency as a decimal.
 */
export interface PayeeStats {
  payeeId: RecordId;
  transactionCount: number;
  netFlowRef: number;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  topCategoryId: RecordId | null;
}

/**
 * 1:1 sidecar on `Accounts` for loan-category accounts (APR, payment plan,
 * lender metadata, event log); the Account still owns the balance (stored
 * negative) and currency. Monetary values are cents (BIGINT), surfaced as
 * Money via model getters.
 */
export interface LoanDetailsModel {
  id: RecordId;
  accountId: RecordId;
  userId: number;
  /** Sub-type (mortgage, auto, student…) – drives UI grouping only. */
  loanType: LOAN_TYPE;
  /**
   * Lender-issued principal in cents, immutable after create —
   * Account.initialBalance drifts with balance corrections, so this frozen
   * field preserves the amortization reference.
   */
  originalPrincipal: number;
  /** Same value converted to the user's base currency at LoanDetails creation. */
  refOriginalPrincipal: number;
  /** APR as percent, e.g. 3.75. Range [0, 100). DECIMAL at rest; the model getter parses Postgres' string to number. */
  interestRate: number;
  termMonths: number | null;
  startDate: string;
  /**
   * Date the outstanding balance (Account.initialBalance) is asserted as-of;
   * post-anchor payments adjust it, earlier ones are baked into the snapshot.
   * Distinct from startDate (contractual origination, never moves).
   */
  balanceAnchorDate: string;
  minPayment: number | null;
  refMinPayment: number | null;
  plannedPayment: number | null;
  refPlannedPayment: number | null;
  /** Day-of-month [1, 31]. Values 29/30/31 clamp to the last day of short months at display/schedule time. */
  paymentDayOfMonth: number | null;
  lenderName: string | null;
  /** Lender's account/loan identifier as the user records it — last four, full number, or any reference they prefer. No format enforced. */
  accountNumber: string | null;
  /** Append-only audit/timeline; see LoanEvent. */
  events: LoanEvent[];
  createdAt: Date;
  updatedAt: Date;
}
