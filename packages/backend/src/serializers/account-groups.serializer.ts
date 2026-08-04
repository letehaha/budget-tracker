/**
 * Account Groups Serializers
 *
 * Handles conversion of account groups with nested accounts.
 * Ensures all monetary fields in nested accounts are properly converted.
 */
import type { AccountGroupApiResponse } from '@bt/shared/types';
import type AccountGroup from '@models/accounts-groups/account-groups.model';

import { serializeAccount } from './accounts.serializer';
import { serializeLogoFields } from './logo-fields.serializer';

/**
 * Serialize an account group, including nested accounts and child groups
 */
function serializeAccountGroup(group: AccountGroup): AccountGroupApiResponse {
  return {
    id: group.id,
    name: group.name,
    userId: group.userId,
    parentGroupId: group.parentGroupId,
    bankDataProviderConnectionId: group.bankDataProviderConnectionId,
    ...serializeLogoFields({ entity: group }),
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
