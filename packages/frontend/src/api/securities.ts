import { api } from '@/api/_api';
import type { SecuritySearchResult } from '@bt/shared/types/investments';

export const searchSecurities = async (query: string): Promise<SecuritySearchResult[]> => {
  const res: SecuritySearchResult[] = await api.get('/investments/securities/search', { query });
  return res;
};

interface PriceUploadInfo {
  oldestDate: string;
  newestDate: string;
  currencyCode: string;
  minAllowedDate: string;
}

export const getPriceUploadInfo = async (currencyCode: string): Promise<PriceUploadInfo> => {
  const res: PriceUploadInfo = await api.post('/investments/securities/price-upload-info', { currencyCode });
  return res;
};

interface BulkUploadPricesPayload {
  searchResult: SecuritySearchResult;
  prices: Array<{
    price: number;
    date: string; // YYYY-MM-DD
    currency: string;
  }>;
  autoFilter: boolean;
  override: boolean;
}

interface BulkUploadPricesResponse {
  newOldestDate: string | null;
  newNewestDate: string | null;
  summary: {
    inserted: number;
    duplicates: number;
    filtered: number;
  };
}

export const bulkUploadPrices = async (payload: BulkUploadPricesPayload): Promise<BulkUploadPricesResponse> => {
  const res: BulkUploadPricesResponse = await api.post('/investments/securities/prices/bulk-upload', payload);
  return res;
};
