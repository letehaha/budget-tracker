/**
 * Fields whose values feed account-balance and Balances-table recomputation.
 * Everything else on a transaction (note, category, payee, tags, timestamps)
 * leaves every balance untouched.
 *
 * Values are typed `unknown` because callers pass raw Sequelize `dataValues` /
 * `_previousDataValues`, where money columns are still plain cents integers and
 * dates may arrive as strings — not the types the model declares.
 */
export interface BalanceRelevantSnapshot {
  accountId?: unknown;
  accountType?: unknown;
  amount?: unknown;
  refAmount?: unknown;
  time?: unknown;
  transactionType?: unknown;
  currencyCode?: unknown;
  refCurrencyCode?: unknown;
  transferNature?: unknown;
  externalData?: unknown;
  isPlanned?: unknown;
}

const PRIMITIVE_FIELDS = [
  'accountId',
  'accountType',
  'amount',
  'refAmount',
  'transactionType',
  'currencyCode',
  'refCurrencyCode',
  'transferNature',
  'isPlanned',
] as const satisfies readonly (keyof BalanceRelevantSnapshot)[];

const toTimeKey = (value: unknown): unknown => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value : parsed;
  }
  return value ?? null;
};

const isSameJsonBlob = ({ next, prev }: { next: unknown; prev: unknown }): boolean => {
  if (next === prev) return true;
  if (next == null || prev == null) return next == null && prev == null;
  return JSON.stringify(next) === JSON.stringify(prev);
};

export const hasBalanceRelevantChange = ({
  next,
  prev,
}: {
  next: BalanceRelevantSnapshot;
  prev: BalanceRelevantSnapshot;
}): boolean => {
  for (const field of PRIMITIVE_FIELDS) {
    if (next[field] !== prev[field]) return true;
  }

  if (toTimeKey(next.time) !== toTimeKey(prev.time)) return true;

  return !isSameJsonBlob({ next: next.externalData, prev: prev.externalData });
};
