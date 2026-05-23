import type {
  InvestmentImportEstimateCostRequest,
  InvestmentImportExecuteRequest,
  InvestmentImportExecuteResponse,
  InvestmentImportExtractRequest,
  InvestmentImportExtractionResult,
  StatementCostEstimate,
} from '@bt/shared/types';

import { type UtilizeReturnType, makeRequest } from '../common';

export function investmentImportEstimateCost<R extends boolean | undefined = false>({
  payload,
  raw,
}: {
  payload: InvestmentImportEstimateCostRequest;
  raw?: R;
}): UtilizeReturnType<() => StatementCostEstimate, R> {
  return makeRequest<StatementCostEstimate, R>({
    method: 'post',
    url: '/investments/transactions-import/estimate-cost',
    payload,
    raw,
  });
}

export function investmentImportExtract<R extends boolean | undefined = false>({
  payload,
  raw,
}: {
  payload: InvestmentImportExtractRequest;
  raw?: R;
}): UtilizeReturnType<() => InvestmentImportExtractionResult, R> {
  return makeRequest<InvestmentImportExtractionResult, R>({
    method: 'post',
    url: '/investments/transactions-import/extract',
    payload,
    raw,
  });
}

export function investmentImportExecute<R extends boolean | undefined = false>({
  payload,
  raw,
}: {
  payload: InvestmentImportExecuteRequest;
  raw?: R;
}): UtilizeReturnType<() => InvestmentImportExecuteResponse, R> {
  return makeRequest<InvestmentImportExecuteResponse, R>({
    method: 'post',
    url: '/investments/transactions-import/execute',
    payload,
    raw,
  });
}
