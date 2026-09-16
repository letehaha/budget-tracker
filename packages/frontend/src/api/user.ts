import { api } from '@/api/_api';
import { UserInfoResponse } from '@bt/shared/types/db-models';

export type { WipeDataSharedResources } from '@bt/shared/types';

export const loadUserData = async (): Promise<UserInfoResponse> => {
  const result = await api.get('/user');

  return result;
};

export const deleteUserAccount = async (): Promise<void> => {
  await api.delete('/user/delete');
};

export const wipeUserData = async ({ acknowledgeSharing }: { acknowledgeSharing: boolean }): Promise<void> => {
  await api.post('/user/wipe-data', { acknowledgeSharing });
};
