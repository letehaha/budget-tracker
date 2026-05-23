import { api } from '@/api/_api';
import type {
  InvestmentImportEstimateCostRequest,
  InvestmentImportExecuteRequest,
  InvestmentImportExecuteResponse,
  InvestmentImportExtractRequest,
  InvestmentImportExtractionResult,
  StatementCostEstimate,
} from '@bt/shared/types';

import type { StatementCostEstimateFailure } from './import-export';

export const estimateInvestmentImportCost = async (
  payload: InvestmentImportEstimateCostRequest,
): Promise<StatementCostEstimate | StatementCostEstimateFailure> => {
  return api.post('/investments/transactions-import/estimate-cost', payload);
};

export const extractInvestmentTransactions = async (
  payload: InvestmentImportExtractRequest,
  options: { signal?: AbortSignal } = {},
): Promise<InvestmentImportExtractionResult> => {
  return api.post('/investments/transactions-import/extract', payload, { signal: options.signal });
};

export const executeInvestmentImport = async (
  payload: InvestmentImportExecuteRequest,
): Promise<InvestmentImportExecuteResponse> => {
  return api.post('/investments/transactions-import/execute', payload);
};
