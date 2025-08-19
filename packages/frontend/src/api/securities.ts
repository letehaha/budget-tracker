import { api } from '@/api/_api';
import type { SecuritySearchResult } from '@bt/shared/types/investments';

export const searchSecurities = async (query: string): Promise<SecuritySearchResult[]> => {
  const res: SecuritySearchResult[] = await api.get('/investments/securities/search', { query });
  return res;
};
