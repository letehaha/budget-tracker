import { PAYMENT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import * as Transactions from '@models/transactions.model';

import { SplitInput } from './splits/types';

export type CreateTransactionParams = Omit<
  Transactions.CreateTransactionPayload,
  'refAmount' | 'transferId' | 'currencyCode' | 'refCurrencyCode'
> & {
  destinationAmount?: Money;
  destinationAccountId?: string;
  destinationTransactionId?: string;
  refundsTxId?: string;
  refundsSplitId?: string;
  splits?: SplitInput[];
  tagIds?: string[];
};

interface UpdateParams {
  id: string;
  userId: number;
  amount?: Money;
  note?: string | null;
  time?: Date;
  transactionType?: TRANSACTION_TYPES;
  paymentType?: PAYMENT_TYPES;
  accountId?: string;
  categoryId?: string;
  transferNature?: TRANSACTION_TRANSFER_NATURE;
  refundsTxId?: string | null;
  refundsSplitId?: string | null;
  refundedByTxIds?: string[] | null;
  splits?: SplitInput[] | null; // null to clear all splits
  tagIds?: string[] | null; // null to clear all tags
}

interface UpdateTransferParams {
  destinationAmount?: Money;
  destinationTransactionId?: string;
  destinationAccountId?: string;
  transferNature?: TRANSACTION_TRANSFER_NATURE;
  transferId?: string;
}

export type UpdateTransactionParams = UpdateParams & UpdateTransferParams;
