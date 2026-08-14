import { RecordId, TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';

/** Every Transactions read must declare how it treats planned rows. No default. */
export type PlannedPolicy =
  | 'exclude' // real money movement only: stats, sync anchors, dedup, payee/subscription matching
  | 'include' // planned + real together: exports, cascades, id-scoped reads the caller validates itself
  | 'only' // planned rows only: the transactions list filtered to plans
  | { visibleTo: number }; // real rows + this user's own plans (shared accounts)

/**
 * Every Transactions read must declare its row-visibility scope. No default.
 *
 * `'unscoped-internal'` adds no row filter, so it is only correct where the row set is already
 * fixed — ids or accounts the caller resolved and authorized itself, the legs of an entity it
 * owns — or where the work legitimately spans users (provider syncs, crons, backups, household
 * transfer conversion).
 */
export type AccessPolicy =
  | { creator: number } // rows authored by this userId
  | { accountOwner: number } // rows on accounts owned by this userId, regardless of author
  | { accessibleTo: number } // rows on accounts this user owns OR that are shared with them
  | { budgetScoped: RecordId[] } // rows linked to these budget ids
  | 'unscoped-internal'; // no row filter — see above

/**
 * The `AccessPolicy` subset that is expressible as a plain Transactions where key.
 * `findWithFilters` composes its own where clause, so scopes that need a pre-resolved id
 * list (accessible accounts, budget junction) are resolved by the caller and handed over
 * through `accountIds`/`budgetIds` — which is what `'pre-scoped'` declares.
 */
export type WhereAccessPolicy = { creator: number } | 'pre-scoped';

/** A bounded scan: the read stops at `limit` and announces that the result may be partial. */
export interface CapPolicy {
  limit: number;
  onTruncated: 'log';
  /** Merged into the truncation log meta, e.g. `{ userId }` — the boundary knows nothing else about the caller. */
  context?: Record<string, unknown>;
}

/** Every Transactions read must declare whether it needs the full result set. No default. */
export type CompletenessPolicy =
  | 'all' // full set: aggregation, recompute, export
  | { page: { offset: number; limit: number } } // UI pagination
  | { cap: CapPolicy }
  | 'probe'; // existence check, limit 1

/** Every Transactions read must declare whether balance-adjustment rows count. No default. */
export type BalanceAdjustmentsPolicy = 'exclude' | 'include';

/** Rows on accounts flagged `excludeFromStats` are kept unless stated otherwise. */
export type ExcludedAccountsPolicy = 'exclude' | 'include';

/** Transfer legs are unconstrained unless stated otherwise. */
export type TransfersPolicy =
  | 'exclude' // money that entered or left the user's world: transferNature = not_transfer
  | 'include' // no constraint
  | 'only' // transfer legs of any nature
  | { natures: TRANSACTION_TRANSFER_NATURE[] }; // domain queries (loan legs, vehicle legs)
