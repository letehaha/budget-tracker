import { api } from '@/api/_api';
import { TransactionModel } from '@bt/shared/types/db-models';

import { formatTransactionResponse } from './transactions';

type RefundRelationship = {
  id: number;
  originalTxId: number;
  refundTxId: number;
  /** The split this refund targets. Null if refunding the whole transaction. */
  splitId: string | null;
  originalTransaction: TransactionModel;
  refundTransaction: TransactionModel;
};

type GetRefundsResponse = RefundRelationship[];

export const getRefundsForTransaction = async (params: { transactionId: number }): Promise<GetRefundsResponse> => {
  const result: GetRefundsResponse = await api.get(`/transactions/${params.transactionId}/refunds`, params);

  return result.map((i) => ({
    ...i,
    originalTransaction: formatTransactionResponse(i.originalTransaction),
    refundTransaction: formatTransactionResponse(i.refundTransaction),
  }));
};
