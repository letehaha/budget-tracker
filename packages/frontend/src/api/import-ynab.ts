import { api } from '@/api/_api';
import type {
  ExecuteYnabRequest,
  ExecuteYnabResponse,
  ParseYnabRequest,
  ParseYnabResponse,
  YnabImportProgress,
} from '@bt/shared/types';

export const parseYnab = async (payload: ParseYnabRequest): Promise<ParseYnabResponse> => {
  return api.post('/import/ynab/parse', payload);
};

export const executeYnabImport = async (payload: ExecuteYnabRequest): Promise<ExecuteYnabResponse> => {
  return api.post('/import/ynab/execute', payload);
};

export const getYnabImportStatus = async ({ jobId }: { jobId: string }): Promise<YnabImportProgress> => {
  return api.get(`/import/ynab/status/${jobId}`);
};
