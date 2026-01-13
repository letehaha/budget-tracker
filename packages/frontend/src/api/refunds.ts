import { api } from '@/api/_api';
import { TransactionModel } from '@bt/shared/types/db-models';

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

// Backend now returns decimals directly, no formatting needed
export const getRefundsForTransaction = async (params: { transactionId: number }): Promise<GetRefundsResponse> => {
  return api.get(`/transactions/${params.transactionId}/refunds`, params);
};
