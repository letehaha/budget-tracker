import type { AccountGroups } from '@/common/types/models';
import { describe, expect, it } from 'vitest';

import { buildAccountGroupList } from './build-account-group-list';

const makeGroup = ({ id, name, parentGroupId = null }: { id: string; name: string; parentGroupId?: string | null }) =>
  ({
    id,
    name,
    parentGroupId,
    accounts: [],
    childGroups: [],
  }) as unknown as AccountGroups;

describe('buildAccountGroupList', () => {
  it('returns an empty list when there are no groups', () => {
    expect(buildAccountGroupList({ groups: [] })).toEqual([]);
  });

  it('sorts groups alphabetically by name', () => {
    const groups = [
      makeGroup({ id: '1', name: 'Wise' }),
      makeGroup({ id: '2', name: 'Cash' }),
      makeGroup({ id: '3', name: 'Monobank' }),
    ];

    expect(buildAccountGroupList({ groups }).map((item) => item.group.name)).toEqual(['Cash', 'Monobank', 'Wise']);
  });

  it('keeps every group as its own row rather than nesting children under parents', () => {
    const groups = [
      makeGroup({ id: 'parent', name: 'Banks' }),
      makeGroup({ id: 'child', name: 'Wise', parentGroupId: 'parent' }),
    ];

    expect(buildAccountGroupList({ groups })).toHaveLength(2);
  });

  it('resolves the parent group name for nested groups', () => {
    const groups = [
      makeGroup({ id: 'parent', name: 'Banks' }),
      makeGroup({ id: 'child', name: 'Wise', parentGroupId: 'parent' }),
    ];

    const child = buildAccountGroupList({ groups }).find((item) => item.group.id === 'child');

    expect(child!.parentName).toBe('Banks');
  });

  it('names the immediate parent only, for groups nested more than one level deep', () => {
    const groups = [
      makeGroup({ id: 'root', name: 'Everything' }),
      makeGroup({ id: 'mid', name: 'Banks', parentGroupId: 'root' }),
      makeGroup({ id: 'leaf', name: 'Wise', parentGroupId: 'mid' }),
    ];

    const list = buildAccountGroupList({ groups });

    expect(list.find((item) => item.group.id === 'leaf')!.parentName).toBe('Banks');
    expect(list.find((item) => item.group.id === 'mid')!.parentName).toBe('Everything');
  });

  it('leaves the parent name empty for top-level groups and for parents missing from the response', () => {
    const groups = [
      makeGroup({ id: 'top', name: 'Cash' }),
      makeGroup({ id: 'orphan', name: 'Wise', parentGroupId: 'not-in-response' }),
    ];

    const [cash, wise] = buildAccountGroupList({ groups });

    expect(cash!.parentName).toBeNull();
    expect(wise!.parentName).toBeNull();
  });
});
