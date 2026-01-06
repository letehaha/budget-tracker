import type { GetRefundTransactionsParams } from '@services/tx-refunds/get-refunds.service';
import * as helpers from '@tests/helpers';

export const createSingleRefund = async (
  payload: { originalTxId: number | null; refundTxId: number; splitId?: string },
  raw = false,
) => {
  const result = await helpers.makeRequest({
    method: 'post',
    url: '/transactions/refund',
    payload,
  });

  return raw ? helpers.extractResponse(result) : result;
};

export const getSingleRefund = async (
  { originalTxId, refundTxId }: { originalTxId: number | null; refundTxId: number },
  raw = false,
) => {
  const result = await helpers.makeRequest({
    method: 'get',
    url: `/transactions/refund?originalTxId=${originalTxId}&refundTxId=${refundTxId}`,
  });

  return raw ? helpers.extractResponse(result) : result;
};

export const getRefundTransactions = async (params?: Omit<GetRefundTransactionsParams, 'userId'>, raw = false) => {
  const queryString = params
    ? Object.entries({ page: 1, limit: 10, ...params })
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&')
    : '';

  const result = await helpers.makeRequest({
    method: 'get',
    url: `/transactions/refunds?${queryString}`,
  });

  return raw ? helpers.extractResponse(result) : result;
};

export const deleteRefund = async (
  payload: { originalTxId: number | null; refundTxId: number | null },
  raw = false,
) => {
  const result = await helpers.makeRequest({
    method: 'delete',
    url: '/transactions/refund',
    payload,
  });

  return raw ? helpers.extractResponse(result) : result;
};
