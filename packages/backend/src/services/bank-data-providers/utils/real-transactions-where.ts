/**
 * Provider code must only see rows that reflect actual bank money movement.
 * Spread this into every Transactions query inside bank-data-providers so planned
 * rows (user intentions) never act as sync anchors, balance sources, or link candidates.
 */
export const REAL_TRANSACTIONS_WHERE = { isPlanned: false } as const;
