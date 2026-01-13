import { api } from '@/api/_api';
import {
  ACCOUNT_CATEGORIES,
  AccountModel,
  AccountWithRelinkStatus,
  TransactionModel,
  endpointsTypes,
} from '@bt/shared/types';

// Backend now returns decimals directly, no conversion needed
export const loadAccounts = async (): Promise<AccountWithRelinkStatus[]> => {
  return api.get('/accounts');
};

export const createAccount = async (payload: endpointsTypes.CreateAccountBody): Promise<AccountModel> => {
  // Backend accepts decimals directly
  return api.post('/accounts', {
    ...payload,
    accountCategory: payload.accountCategory || ACCOUNT_CATEGORIES.general,
  });
};

export const editAccount = async ({
  id,
  ...data
}: endpointsTypes.UpdateAccountBody & {
  id: number;
}): Promise<AccountModel> => {
  // Backend accepts decimals directly
  return api.put(`/accounts/${id}`, data);
};

export interface DeleteAccountPayload {
  id: number;
}
export const deleteAccount = async ({ id }: DeleteAccountPayload): Promise<void> => api.delete(`/accounts/${id}`);

export interface UnlinkAccountFromBankConnectionPayload {
  id: number;
}
export const unlinkAccountFromBankConnection = async ({
  id,
}: UnlinkAccountFromBankConnectionPayload): Promise<AccountModel> => {
  return api.post(`/accounts/${id}/unlink`);
};

export interface LinkAccountToBankConnectionPayload {
  accountId: number;
  connectionId: number;
  externalAccountId: string;
}
export const linkAccountToBankConnection = async ({
  accountId,
  connectionId,
  externalAccountId,
}: LinkAccountToBankConnectionPayload): Promise<{
  account: AccountModel;
  balanceDifference: number;
  balanceAdjustmentTransaction: TransactionModel | null;
  message: string;
}> => {
  return api.post(`/accounts/${accountId}/link`, {
    connectionId,
    externalAccountId,
  });
};
