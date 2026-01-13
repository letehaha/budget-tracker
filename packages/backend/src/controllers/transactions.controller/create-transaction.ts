import { ACCOUNT_TYPES, PAYMENT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { deserializeCreateTransaction, serializeTransactionTuple } from '@root/serializers';
import * as transactionsService from '@services/transactions';
import { z } from 'zod';

const recordId = () => z.number().int().positive().finite();

// Amount fields now accept decimals (e.g., 100.50) - conversion to cents happens in deserializer
const amountSchema = () => z.number().positive('Amount must be greater than 0').finite();

const splitSchema = z.object({
  categoryId: recordId(),
  amount: amountSchema(), // decimal input
  note: z.string().max(100, 'Split note must not exceed 100 characters').nullish(),
});

const schema = z.object({
  body: z
    .object({
      amount: amountSchema(), // decimal input
      commissionRate: amountSchema().optional(),
      note: z.string().max(1000, 'The string must not exceed 1000 characters.').nullish(),
      time: z.string().datetime({ message: 'Invalid ISO date string' }).optional(),
      transactionType: z.nativeEnum(TRANSACTION_TYPES),
      paymentType: z.nativeEnum(PAYMENT_TYPES),
      accountId: recordId(),
      accountType: z.nativeEnum(ACCOUNT_TYPES).optional(),
      destinationAmount: amountSchema().optional(), // decimal input
      destinationAccountId: recordId().optional(),
      destinationTransactionId: recordId().optional(),
      categoryId: z.union([recordId(), z.undefined()]),
      transferNature: z.nativeEnum(TRANSACTION_TRANSFER_NATURE),
      refundForTxId: recordId().optional(),
      refundForSplitId: z.string().uuid().optional(),
      splits: z.array(splitSchema).max(10, 'Maximum 10 splits allowed').optional(),
      tagIds: z.array(recordId()).max(20, 'Maximum 20 tags allowed').optional(),
    })
    .refine(
      (data) =>
        !(
          data.transferNature &&
          data.transferNature !== TRANSACTION_TRANSFER_NATURE.not_transfer &&
          data.refundForTxId
        ),
      {
        message: `Non-${TRANSACTION_TRANSFER_NATURE.not_transfer} cannot be used in "transferNature" when "refundForTxId" is used`,
        path: ['transferNature', 'refundForTxId'],
      },
    )
    .refine((data) => !(data.refundForSplitId && !data.refundForTxId), {
      message: '"refundForSplitId" can only be provided when "refundForTxId" is specified',
      path: ['refundForSplitId', 'refundForTxId'],
    })
    .refine(
      (data) => {
        if (data.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_out_wallet) {
          return !(data.accountId && data.destinationAccountId);
        }
        return true;
      },
      {
        message: `"accountId" and "destinationAccountId" cannot be used both when "${TRANSACTION_TRANSFER_NATURE.transfer_out_wallet}" is provided`,
        path: ['accountId', 'destinationAccountId'],
      },
    )
    .refine(
      (data) => {
        if (data.transferNature === TRANSACTION_TRANSFER_NATURE.common_transfer && data.destinationTransactionId) {
          return !(data.destinationAccountId || data.destinationAmount);
        }
        return true;
      },
      {
        message: `When "destinationTransactionId" is provided for ${TRANSACTION_TRANSFER_NATURE.common_transfer}, other fields should not be present`,
        path: ['destinationAccountId', 'destinationAmount', 'destinationTransactionId'],
      },
    )
    .refine(
      (data) => {
        if (data.transferNature === TRANSACTION_TRANSFER_NATURE.common_transfer && !data.destinationTransactionId) {
          return !!(data.destinationAccountId && data.destinationAmount);
        }
        return true;
      },
      {
        message: `For ${TRANSACTION_TRANSFER_NATURE.common_transfer} without "destinationTransactionId" - "destinationAccountId", and "destinationAmount" must be provided`,
        path: ['destinationAccountId', 'destinationAmount', 'destinationTransactionId'],
      },
    )
    .refine(
      (data) => {
        if (data.transferNature === TRANSACTION_TRANSFER_NATURE.not_transfer && data.categoryId === undefined) {
          return false;
        }
        return true;
      },
      {
        message: "'categoryId' is required for non-transfer transactions.",
        path: ['categoryId', 'transferNature'],
      },
    )
    .refine(
      (data) => {
        if (typeof data.commissionRate === 'number' && data.amount < data.commissionRate) {
          return false;
        }
        return true;
      },
      {
        message: "'commissionRate' cannot be greater than 'amount",
        path: ['commissionRate', 'amount'],
      },
    )
    .refine(
      (data) => {
        // Splits are not allowed on transfer transactions
        if (data.splits && data.splits.length > 0 && data.transferNature !== TRANSACTION_TRANSFER_NATURE.not_transfer) {
          return false;
        }
        return true;
      },
      {
        message: 'Splits cannot be added to transfer transactions',
        path: ['splits', 'transferNature'],
      },
    ),
});

export default createController(schema, async ({ user, body }) => {
  const { id: userId } = user;

  // Deserialize: convert decimal amounts to cents
  const params = deserializeCreateTransaction(body, userId);

  // TODO: Add validations
  // 1. Amount and destinationAmount with same currency should be equal
  // 2. That transactions here might be created only with system account type

  const transactions = await transactionsService.createTransaction(params);

  // Serialize: convert cents to decimal for API response
  // createTransaction returns [baseTx, oppositeTx?] tuple
  return { data: serializeTransactionTuple(transactions) };
});
