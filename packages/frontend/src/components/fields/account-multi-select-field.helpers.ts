import type { CheckedState } from '@/components/lib/ui/checkbox';
import type { GroupedAccountsGroup } from '@/composable/use-grouped-accounts';
import type { AccountModel } from '@bt/shared/types';

/**
 * Pure selection/search helpers for the account multi-select field. Kept free of Vue so they can
 * be unit-tested in isolation (see `account-multi-select-field.helpers.spec.ts`). `term` is
 * expected to be already lower-cased and trimmed by the caller.
 */

/** An account matches by name or currency code (both compared case-insensitively). */
export const matchesAccountSearch = ({ account, term }: { account: AccountModel; term: string }): boolean =>
  account.name.toLowerCase().includes(term) || account.currencyCode.toLowerCase().includes(term);

/**
 * Filters groups by a search term. A group whose NAME matches keeps all its accounts; otherwise
 * only its matching accounts survive, and a group left with none drops out. An empty term returns
 * the groups untouched.
 */
export const filterGroupsBySearch = ({
  groups,
  term,
}: {
  groups: GroupedAccountsGroup[];
  term: string;
}): GroupedAccountsGroup[] => {
  if (!term) return groups;
  return groups
    .map((group) => {
      if (group.name.toLowerCase().includes(term)) return group;
      const accounts = group.accounts.filter((account) => matchesAccountSearch({ account, term }));
      return accounts.length > 0 ? { ...group, accounts } : null;
    })
    .filter((group): group is GroupedAccountsGroup => group !== null);
};

/** Filters a flat account list by a search term; an empty term returns the list untouched. */
export const filterAccountsBySearch = ({
  accounts,
  term,
}: {
  accounts: AccountModel[];
  term: string;
}): AccountModel[] => {
  if (!term) return accounts;
  return accounts.filter((account) => matchesAccountSearch({ account, term }));
};

/** Tri-state select-all for a set of accounts against the current selection. */
export const computeSectionCheckState = ({
  accounts,
  selectedIds,
}: {
  accounts: AccountModel[];
  selectedIds: Set<string>;
}): CheckedState => {
  const selectedCount = accounts.filter((account) => selectedIds.has(account.id)).length;
  if (selectedCount === 0) return false;
  if (selectedCount === accounts.length) return true;
  return 'indeterminate';
};

/** Toggles one account id in a selection, returning a new array. */
export const toggleAccountId = ({ selected, accountId }: { selected: string[]; accountId: string }): string[] => {
  const ids = new Set(selected);
  if (ids.has(accountId)) ids.delete(accountId);
  else ids.add(accountId);
  return [...ids];
};

/**
 * Select-all / deselect-all a section: when every one of the section's accounts is already
 * selected it removes them all, otherwise it adds the missing ones. Returns a new array.
 */
export const toggleSectionIds = ({
  selected,
  sectionAccountIds,
}: {
  selected: string[];
  sectionAccountIds: string[];
}): string[] => {
  const ids = new Set(selected);
  const allSelected = sectionAccountIds.every((id) => ids.has(id));
  if (allSelected) {
    for (const id of sectionAccountIds) ids.delete(id);
  } else {
    for (const id of sectionAccountIds) ids.add(id);
  }
  return [...ids];
};
