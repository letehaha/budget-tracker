import { NO_CURRENCY_CODE } from '@bt/shared/types';

/**
 * Accounts the provider listed without a currency (NO_CURRENCY_CODE) can only
 * be connected once the user picks one. These helpers own that rule for every
 * selection surface (list, dialog, connectors) so it can't drift between them.
 */
export const countMissingCurrencySelections = ({
  accounts,
  selectedIds,
  overrides,
}: {
  accounts: Array<{ externalId: string; currency: string }>;
  selectedIds: string[];
  overrides: Record<string, string>;
}): number =>
  accounts.filter(
    (account) =>
      account.currency === NO_CURRENCY_CODE &&
      selectedIds.includes(account.externalId) &&
      !overrides[account.externalId],
  ).length;

/** Returns a new overrides map with the pick applied (or removed when `code` is null). */
export const applyCurrencyOverride = ({
  overrides,
  externalId,
  code,
}: {
  overrides: Record<string, string>;
  externalId: string;
  code: string | null;
}): Record<string, string> => {
  const next = { ...overrides };
  if (code) next[externalId] = code;
  else delete next[externalId];
  return next;
};
