import { api } from '@/api/_api';

export const triggerSecuritiesPriceSync = async (): Promise<{ message: string }> => {
  const result = await api.post('/investments/sync/securities-prices');
  return result || { message: 'Price sync completed successfully' };
};
