import { api } from '@/api/_api';
import { UserModel } from '@bt/shared/types/db-models';

export interface StartDemoResponse {
  user: UserModel;
}

export const startDemo = async (): Promise<StartDemoResponse> => {
  const result = await api.post('/demo');

  return result;
};
