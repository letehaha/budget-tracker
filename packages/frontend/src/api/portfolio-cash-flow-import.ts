import { api } from '@/api/_api';
import type {
  CashFlowDetectDuplicatesResponse,
  CashFlowExecuteResponse,
  CashFlowExecuteRow,
  CashFlowExtractionResult,
  ExtractedCashFlowRow,
} from '@bt/shared/types';

interface ExtractFromTextParams {
  portfolioId: number;
  text: string;
  fileBase64?: never;
  fileName?: never;
  userHint?: string | null;
}

interface ExtractFromFileParams {
  portfolioId: number;
  text?: never;
  fileBase64: string;
  fileName?: string;
  userHint?: string | null;
}

type ExtractCashFlowsParams = ExtractFromTextParams | ExtractFromFileParams;

export const extractCashFlows = async (params: ExtractCashFlowsParams): Promise<CashFlowExtractionResult> => {
  return api.post('/import/portfolio-cash-flows/extract', params);
};

export const detectCashFlowDuplicates = async ({
  portfolioId,
  rows,
}: {
  portfolioId: number;
  rows: ExtractedCashFlowRow[];
}): Promise<CashFlowDetectDuplicatesResponse> => {
  return api.post('/import/portfolio-cash-flows/detect-duplicates', { portfolioId, rows });
};

export const executeCashFlowImport = async ({
  portfolioId,
  rows,
}: {
  portfolioId: number;
  rows: CashFlowExecuteRow[];
}): Promise<CashFlowExecuteResponse> => {
  return api.post('/import/portfolio-cash-flows/execute', { portfolioId, rows });
};
