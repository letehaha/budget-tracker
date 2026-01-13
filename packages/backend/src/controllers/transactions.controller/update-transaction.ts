import { PAYMENT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES, parseToCents } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { removeUndefinedKeys } from '@js/helpers';
import { serializeTransactionTuple } from '@root/serializers';
import * as transactionsService from '@services/transactions';
import { z } from 'zod';

// Amount fields now accept decimals (e.g., 100.50) - conversion to cents happens in controller
const amountSchema = () => z.number().positive('Amount must be greater than 0').finite();

const splitSchema = z.object({
  categoryId: recordId(),
  amount: amountSchema(), // decimal input
  note: z.string().max(100, 'Split note must not exceed 100 characters').nullish(),
});

const bodyZodSchema = z
  .object({
    amount: amountSchema().optional(), // decimal input
    destinationAmount: amountSchema().optional(), // decimal input
    note: z.string().max(1000, 'The string must not exceed 1000 characters.').nullish(),
    time: z.string().datetime({ message: 'Invalid ISO date string' }).optional(),
    transactionType: z.nativeEnum(TRANSACTION_TYPES).optional(),
    paymentType: z.nativeEnum(PAYMENT_TYPES).optional(),
    accountId: recordId().optional(),
    destinationAccountId: recordId().optional(),
    destinationTransactionId: recordId().optional(),
    categoryId: recordId().optional(),
    transferNature: z.nativeEnum(TRANSACTION_TRANSFER_NATURE).optional(),
    refundedByTxIds: z.array(recordId()).nullish(),
    refundsTxId: recordId().nullish(),
    refundsSplitId: z.string().uuid().nullish(),
    splits: z.array(splitSchema).max(10, 'Maximum 10 splits allowed').nullish(),
    tagIds: z.array(recordId()).max(20, 'Maximum 20 tags allowed').nullish(),
  })
  .refine((data) => !(data.refundsSplitId && !data.refundsTxId), {
    message: '"refundsSplitId" can only be provided when "refundsTxId" is specified',
    path: ['refundsSplitId', 'refundsTxId'],
  })
  .refine((data) => !(data.refundedByTxIds !== undefined && data.refundsTxId !== undefined), {
    message: "Both 'refundedByTxIds' and 'refundsTxId' are not allowed simultaneously",
  })
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
      // Splits are not allowed on transfer transactions
      if (data.splits && data.splits.length > 0) {
        // Explicit transfer via transferNature
        if (data.transferNature && data.transferNature !== TRANSACTION_TRANSFER_NATURE.not_transfer) {
          return false;
        }
        // Implicit transfer via destination fields
        if (data.destinationAccountId || data.destinationAmount || data.destinationTransactionId) {
          return false;
        }
      }
      return true;
    },
    {
      message: 'Splits cannot be added to transfer transactions',
      path: ['splits', 'transferNature'],
    },
  );

const paramsZodSchema = z.object({
  id: z.string().refine((val) => !isNaN(Number(val)), {
    message: 'ID must be a valid number',
  }),
});

const schema = z.object({
  params: paramsZodSchema,
  body: bodyZodSchema,
});

export default createController(schema, async ({ user, params, body }) => {
  const { id } = params;
  const {
    amount,
    destinationAmount,
    note,
    time,
    transactionType,
    paymentType,
    accountId,
    destinationAccountId,
    destinationTransactionId,
    categoryId,
    transferNature,
    refundedByTxIds,
    refundsTxId,
    refundsSplitId,
    splits,
    tagIds,
  } = body;
  const { id: userId } = user;

  // Convert decimal amounts to cents
  const amountInCents = amount !== undefined ? parseToCents(amount) : undefined;
  const destinationAmountInCents = destinationAmount !== undefined ? parseToCents(destinationAmount) : undefined;
  const splitsInCents = splits?.map((split) => ({
    ...split,
    amount: parseToCents(split.amount),
  }));

  const transactions = await transactionsService.updateTransaction({
    id: parseInt(id),
    ...removeUndefinedKeys({
      amount: amountInCents,
      destinationAmount: destinationAmountInCents,
      destinationTransactionId,
      note,
      time: time ? new Date(time) : undefined,
      userId,
      transactionType,
      paymentType,
      accountId,
      destinationAccountId,
      categoryId,
      transferNature,
      refundedByTxIds,
      refundsTxId,
      refundsSplitId,
    }),
    // splits can be null to clear all splits, so don't use removeUndefinedKeys
    ...(splits !== undefined ? { splits: splits === null ? null : splitsInCents } : {}),
    // tagIds can be null to clear all tags, so don't use removeUndefinedKeys
    ...(tagIds !== undefined ? { tagIds } : {}),
  });

  // Serialize: convert cents to decimal for API response
  // updateTransaction returns [baseTx, oppositeTx?] tuple
  return { data: serializeTransactionTuple(transactions) };
});
