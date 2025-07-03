import { api } from '@/api/_api';
import type { SecurityModel } from '@bt/shared/types/investments';

export const searchSecurities = async (query: string): Promise<SecurityModel[]> => {
  const res: SecurityModel[] = await api.get('/investments/securities/search', { query });
  return res;
};
