import type { AccountGroups } from '@/common/types/models';

export interface AccountGroupListItem {
  group: AccountGroups;
  /** Name of the group this one sits under, when the parent is part of the same response. */
  parentName: string | null;
}

/**
 * The endpoint returns every group in one flat list, and a nested group's own
 * `childGroups` entries come back without their accounts. So the list renders flat and
 * each row states its parent by name instead of trying to nest, and every row reads
 * `group.accounts` — its own, fully hydrated set — rather than walking `childGroups`.
 */
export const buildAccountGroupList = ({ groups }: { groups: AccountGroups[] }): AccountGroupListItem[] => {
  const namesById = new Map(groups.map((group) => [group.id, group.name]));

  return groups
    .map((group) => ({
      group,
      parentName: group.parentGroupId ? (namesById.get(group.parentGroupId) ?? null) : null,
    }))
    .sort((a, b) => a.group.name.localeCompare(b.group.name));
};
