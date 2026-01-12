import { PAYMENT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import * as Transactions from '@models/Transactions.model';

import { SplitInput } from './splits/types';

export type CreateTransactionParams = Omit<
  Transactions.CreateTransactionPayload,
  'refAmount' | 'transferId' | 'currencyCode' | 'refCurrencyCode'
> & {
  destinationAmount?: number;
  destinationAccountId?: number;
  destinationTransactionId?: number;
  refundsTxId?: number;
  refundsSplitId?: string;
  splits?: SplitInput[];
  tagIds?: number[];
};

interface UpdateParams {
  id: number;
  userId: number;
  amount?: number;
  note?: string | null;
  time?: Date;
  transactionType?: TRANSACTION_TYPES;
  paymentType?: PAYMENT_TYPES;
  accountId?: number;
  categoryId?: number;
  transferNature?: TRANSACTION_TRANSFER_NATURE;
  refundsTxId?: number | null;
  refundsSplitId?: string | null;
  refundedByTxIds?: number[] | null;
  splits?: SplitInput[] | null; // null to clear all splits
  tagIds?: number[] | null; // null to clear all tags
}

interface UpdateTransferParams {
  destinationAmount?: number;
  destinationTransactionId?: number;
  destinationAccountId?: number;
  transferNature?: TRANSACTION_TRANSFER_NATURE;
  transferId?: string;
}

export type UpdateTransactionParams = UpdateParams & UpdateTransferParams;
