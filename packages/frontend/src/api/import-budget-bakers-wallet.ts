import { api } from '@/api/_api';
import type {
  DetectBudgetBakersWalletDuplicatesRequest,
  DetectBudgetBakersWalletDuplicatesResponse,
  ExecuteBudgetBakersWalletRequest,
  ExecuteBudgetBakersWalletResponse,
  ParseBudgetBakersWalletRequest,
  ParseBudgetBakersWalletResponse,
  BudgetBakersWalletImportProgress,
} from '@bt/shared/types';

export const parseBudgetBakersWallet = async (
  payload: ParseBudgetBakersWalletRequest,
): Promise<ParseBudgetBakersWalletResponse> => {
  return api.post('/import/budget-bakers-wallet/parse', payload);
};

export const detectBudgetBakersWalletDuplicates = async (
  payload: DetectBudgetBakersWalletDuplicatesRequest,
): Promise<DetectBudgetBakersWalletDuplicatesResponse> => {
  return api.post('/import/budget-bakers-wallet/detect-duplicates', payload);
};

export const executeBudgetBakersWalletImport = async (
  payload: ExecuteBudgetBakersWalletRequest,
): Promise<ExecuteBudgetBakersWalletResponse> => {
  return api.post('/import/budget-bakers-wallet/execute', payload);
};

export const getBudgetBakersWalletImportStatus = async ({
  jobId,
}: {
  jobId: string;
}): Promise<BudgetBakersWalletImportProgress> => {
  return api.get(`/import/budget-bakers-wallet/status/${jobId}`);
};
