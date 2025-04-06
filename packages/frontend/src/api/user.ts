import { api } from '@/api/_api';
import { UserModel } from '@bt/shared/types/db-models';

export const loadUserData = async (): Promise<UserModel> => {
  const result = await api.get('/user');

  return result;
};
