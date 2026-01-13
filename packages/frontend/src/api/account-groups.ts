import { api } from '@/api/_api';
import { AccountGroups } from '@/common/types/models';

export const loadAccountGroups = async (
  payload: { accountIds?: number[]; hidden?: boolean } = {},
): Promise<AccountGroups[]> => {
  return api.get('/account-group', payload);
};

export const createAccountsGroup = async (payload: { name: string }): Promise<void> => {
  await api.post('/account-group', payload);
};

export const linkAccountToGroup = async (payload: { accountId: number; groupId: number }) => {
  await api.post(`/account-group/${payload.groupId}/add-account/${payload.accountId}`);
};

export const removeAccountFromGroup = async (payload: { accountIds: number[]; groupId: number }) => {
  await api.delete(`/account-group/${payload.groupId}/accounts`, {
    data: { accountIds: payload.accountIds },
  });
};

export const updateAccountGroup = async (payload: {
  groupId: number;
  updates: { name?: string; parentGroupId?: number | null };
}) => {
  await api.put(`/account-group/${payload.groupId}`, payload.updates);
};

export const deleteAccountGroup = async (payload: { userId: number; groupId: number }) => {
  await api.delete(`/account-group/${payload.groupId}`);
};
