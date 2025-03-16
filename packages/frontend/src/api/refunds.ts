import { api } from '@/api/_api';
import { TransactionModel } from '@bt/shared/types/db-models';

import { formatTransactionResponse } from './transactions';

type GetRefundsResponse = {
  id: number;
  originalTxId: number;
  refundTxId: number;
  originalTransaction: TransactionModel;
  refundTransaction: TransactionModel;
}[];

export const getRefundsForTransaction = async (params: { transactionId: number }): Promise<GetRefundsResponse> => {
  const result: GetRefundsResponse = await api.get(`/transactions/${params.transactionId}/refunds`, params);

  return result.map((i) => ({
    ...i,
    originalTransaction: formatTransactionResponse(i.originalTransaction),
    refundTransaction: formatTransactionResponse(i.refundTransaction),
  }));
};
