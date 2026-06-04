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
  /**
   * Raw merchant string supplied by a bank-data provider (Monobank `counterName`,
   * SimpleFIN `payee`, EnableBanking debtor/creditor name, LunchFlow `merchant`).
   * When set and the row isn't `payeeLocked` and no `payeeId` was explicitly
   * provided, the create path runs Payee extraction and links + auto-categorizes
   * via `payee_rule` if applicable.
   */
  rawMerchantName?: string | null;
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
  payeeId?: string | null;
  payeeLocked?: boolean;
}

interface UpdateTransferParams {
  destinationAmount?: Money;
  destinationTransactionId?: string;
  destinationAccountId?: string;
  transferNature?: TRANSACTION_TRANSFER_NATURE;
  transferId?: string;
}

export type UpdateTransactionParams = UpdateParams & UpdateTransferParams;
