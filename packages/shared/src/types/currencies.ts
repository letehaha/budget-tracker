/**
 * Per-table counts returned by a base-currency recalculation: how many rows had
 * their `ref*` amounts rewritten into the new base. Surfaced as the change-base
 * job result so the client can confirm the sweep touched every table.
 */
export interface RecalculateResult {
  transactionsUpdated: number;
  accountsUpdated: number;
  loanDetailsUpdated: number;
  balancesRebuilt: number;
  investmentTransactionsUpdated: number;
  portfolioTransfersUpdated: number;
  holdingsUpdated: number;
  portfolioBalancesUpdated: number;
}

/**
 * Recalculation phases in execution order. Shared so the frontend's per-step
 * progress labels stay compile-linked to what the backend actually reports.
 */
export const BASE_CURRENCY_CHANGE_STEPS = [
  'transactions',
  'accounts',
  'loanDetails',
  'balances',
  'investmentTransactions',
  'portfolioTransfers',
  'holdings',
  'portfolioBalances',
] as const;

export type BaseCurrencyChangeStep = (typeof BASE_CURRENCY_CHANGE_STEPS)[number];

/**
 * Result of `GET /user/currencies/change-base/status`. The base-currency change
 * runs as a background job that any device polls to drive the blocking overlay.
 * `idle` covers both "never ran" and "job aged out of retention" — the endpoint
 * never 404s, since the frontend calls it on every boot.
 */
export type BaseCurrencyChangeStatus =
  | { state: 'idle' }
  | { state: 'queued'; jobId: string }
  | { state: 'running'; jobId: string; step?: BaseCurrencyChangeStep; startedAt?: number }
  | { state: 'completed'; jobId: string; finishedAt: number; result: RecalculateResult }
  | { state: 'failed'; jobId: string; finishedAt?: number; error: string };
