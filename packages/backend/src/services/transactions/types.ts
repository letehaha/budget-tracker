import type { PAYMENT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import type { RecordId } from '@bt/shared/types';
import type { Money } from '@common/types/money';
import type * as Transactions from '@models/transactions.model';

import type { SplitInput } from './splits/types';

export type CreateTransactionParams = Omit<
  Transactions.CreateTransactionPayload,
  'refAmount' | 'transferId' | 'currencyCode' | 'refCurrencyCode'
> & {
  destinationAmount?: Money;
  destinationAccountId?: RecordId;
  destinationTransactionId?: RecordId;
  refundsTxId?: RecordId;
  refundsSplitId?: string;
  splits?: SplitInput[];
  tagIds?: string[];
};

interface UpdateParams {
  id: RecordId;
  userId: number;
  amount?: Money;
  note?: string | null;
  time?: Date;
  transactionType?: TRANSACTION_TYPES;
  paymentType?: PAYMENT_TYPES;
  accountId?: RecordId;
  categoryId?: RecordId | null;
  transferNature?: TRANSACTION_TRANSFER_NATURE;
  refundsTxId?: RecordId | null;
  refundsSplitId?: string | null;
  refundedByTxIds?: RecordId[] | null;
  splits?: SplitInput[] | null; // null to clear all splits
  tagIds?: string[] | null; // null to clear all tags
}

interface UpdateTransferParams {
  destinationAmount?: Money;
  destinationTransactionId?: RecordId;
  destinationAccountId?: RecordId;
  transferNature?: TRANSACTION_TRANSFER_NATURE;
  transferId?: string;
}

export type UpdateTransactionParams = UpdateParams & UpdateTransferParams;
