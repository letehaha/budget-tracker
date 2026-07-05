import type { GroupedAccountsGroup } from '@/composable/use-grouped-accounts';
import type { AccountModel } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import {
  computeSectionCheckState,
  filterAccountsBySearch,
  filterGroupsBySearch,
  matchesAccountSearch,
  toggleAccountId,
  toggleSectionIds,
} from './account-multi-select-field.helpers';

const account = ({
  id,
  name,
  currencyCode = 'USD',
}: {
  id: string;
  name: string;
  currencyCode?: string;
}): AccountModel => ({ id, name, currencyCode }) as unknown as AccountModel;

const group = ({
  id,
  name,
  accounts,
}: {
  id: string;
  name: string;
  accounts: AccountModel[];
}): GroupedAccountsGroup => ({
  id,
  name,
  accounts,
});

describe('matchesAccountSearch', () => {
  const acc = account({ id: '1', name: 'Checking', currencyCode: 'EUR' });

  it('matches by name (case-insensitive)', () => {
    expect(matchesAccountSearch({ account: acc, term: 'check' })).toBe(true);
  });

  it('matches by currency code', () => {
    expect(matchesAccountSearch({ account: acc, term: 'eur' })).toBe(true);
  });

  it('returns false when neither name nor currency matches', () => {
    expect(matchesAccountSearch({ account: acc, term: 'savings' })).toBe(false);
  });
});

describe('filterGroupsBySearch', () => {
  const groups = [
    group({
      id: 'g1',
      name: 'Banks',
      accounts: [account({ id: 'a1', name: 'Chase' }), account({ id: 'a2', name: 'Monzo' })],
    }),
    group({ id: 'g2', name: 'Cash', accounts: [account({ id: 'a3', name: 'Wallet' })] }),
  ];

  it('returns groups untouched for an empty term', () => {
    expect(filterGroupsBySearch({ groups, term: '' })).toBe(groups);
  });

  it('keeps every account when the group NAME matches', () => {
    const result = filterGroupsBySearch({ groups, term: 'banks' });
    expect(result).toHaveLength(1);
    expect(result[0]!.accounts).toHaveLength(2);
  });

  it('keeps only matching accounts when the group name does not match', () => {
    const result = filterGroupsBySearch({ groups, term: 'chase' });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('g1');
    expect(result[0]!.accounts.map((a) => a.id)).toEqual(['a1']);
  });

  it('drops a group with no name or account match', () => {
    expect(filterGroupsBySearch({ groups, term: 'nothing' })).toHaveLength(0);
  });
});

describe('filterAccountsBySearch', () => {
  const accounts = [account({ id: 'a1', name: 'Chase' }), account({ id: 'a2', name: 'Wallet' })];

  it('returns the list untouched for an empty term', () => {
    expect(filterAccountsBySearch({ accounts, term: '' })).toBe(accounts);
  });

  it('filters to matching accounts', () => {
    expect(filterAccountsBySearch({ accounts, term: 'wall' }).map((a) => a.id)).toEqual(['a2']);
  });
});

describe('computeSectionCheckState', () => {
  const accounts = [account({ id: 'a1', name: 'A' }), account({ id: 'a2', name: 'B' })];

  it('is false when none are selected', () => {
    expect(computeSectionCheckState({ accounts, selectedIds: new Set() })).toBe(false);
  });

  it('is true when all are selected', () => {
    expect(computeSectionCheckState({ accounts, selectedIds: new Set(['a1', 'a2']) })).toBe(true);
  });

  it('is indeterminate when only some are selected', () => {
    expect(computeSectionCheckState({ accounts, selectedIds: new Set(['a1']) })).toBe('indeterminate');
  });
});

describe('toggleAccountId', () => {
  it('adds an unselected id', () => {
    expect(toggleAccountId({ selected: ['a1'], accountId: 'a2' })).toEqual(['a1', 'a2']);
  });

  it('removes an already-selected id', () => {
    expect(toggleAccountId({ selected: ['a1', 'a2'], accountId: 'a1' })).toEqual(['a2']);
  });
});

describe('toggleSectionIds', () => {
  it('adds the missing ids when the section is not fully selected', () => {
    expect(toggleSectionIds({ selected: ['a1'], sectionAccountIds: ['a1', 'a2', 'a3'] })).toEqual(['a1', 'a2', 'a3']);
  });

  it('removes them all when the section is already fully selected', () => {
    expect(toggleSectionIds({ selected: ['a1', 'a2', 'x'], sectionAccountIds: ['a1', 'a2'] })).toEqual(['x']);
  });
});
