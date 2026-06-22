import { api } from '@/api/_api';
import type {
  DetectWalletDuplicatesRequest,
  DetectWalletDuplicatesResponse,
  ExecuteWalletRequest,
  ExecuteWalletResponse,
  ParseWalletRequest,
  ParseWalletResponse,
  WalletImportProgress,
} from '@bt/shared/types';

export const parseWallet = async (payload: ParseWalletRequest): Promise<ParseWalletResponse> => {
  return api.post('/import/wallet/parse', payload);
};

export const detectWalletDuplicates = async (
  payload: DetectWalletDuplicatesRequest,
): Promise<DetectWalletDuplicatesResponse> => {
  return api.post('/import/wallet/detect-duplicates', payload);
};

export const executeWalletImport = async (payload: ExecuteWalletRequest): Promise<ExecuteWalletResponse> => {
  return api.post('/import/wallet/execute', payload);
};

export const getWalletImportStatus = async ({ jobId }: { jobId: string }): Promise<WalletImportProgress> => {
  return api.get(`/import/wallet/status/${jobId}`);
};
