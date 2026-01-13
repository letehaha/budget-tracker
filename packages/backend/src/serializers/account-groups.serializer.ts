/**
 * Account Groups Serializers
 *
 * Handles conversion of account groups with nested accounts.
 * Ensures all monetary fields in nested accounts are properly converted.
 */
import type AccountGroup from '@models/accounts-groups/AccountGroups.model';

import { type AccountApiResponse, serializeAccount } from './accounts.serializer';

export interface AccountGroupApiResponse {
  id: number;
  name: string;
  userId: number;
  parentGroupId: number | null;
  accounts: AccountApiResponse[];
  childGroups: AccountGroupApiResponse[];
}

/**
 * Serialize an account group, including nested accounts and child groups
 */
export function serializeAccountGroup(group: AccountGroup): AccountGroupApiResponse {
  return {
    id: group.id,
    name: group.name,
    userId: group.userId,
    parentGroupId: group.parentGroupId,
    accounts: (group.accounts || []).map(serializeAccount),
    childGroups: (group.childGroups || []).map(serializeAccountGroup),
  };
}

/**
 * Serialize multiple account groups
 */
export function serializeAccountGroups(groups: AccountGroup[]): AccountGroupApiResponse[] {
  return groups.map(serializeAccountGroup);
}
