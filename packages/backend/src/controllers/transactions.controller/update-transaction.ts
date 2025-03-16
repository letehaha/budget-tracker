import { API_RESPONSE_STATUS, PAYMENT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { CustomRequest, CustomResponse } from '@common/types';
import { errorHandler } from '@controllers/helpers';
import { removeUndefinedKeys } from '@js/helpers';
import * as transactionsService from '@services/transactions';
import { z } from 'zod';

export const updateTransaction = async (req, res: CustomResponse) => {
  try {
    const { id } = req.validated.params;
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
    } = (req as CustomRequest<typeof updateTransactionSchema>).validated.body;
    const { id: userId } = (req as CustomRequest<typeof updateTransactionSchema>).user;

    const data = await transactionsService.updateTransaction({
      id: parseInt(id),
      ...removeUndefinedKeys({
        amount,
        destinationAmount,
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
      }),
    });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: data,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

const recordId = () => z.number().int().positive().finite();
const bodyZodSchema = z
  .object({
    amount: z.number().int().positive('Amount must be greater than 0').finite().optional(),
    destinationAmount: z.number().int().positive('Amount must be greater than 0').finite().optional(),
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
  );

const paramsZodSchema = z.object({
  id: z.string().refine((val) => !isNaN(Number(val)), {
    message: 'ID must be a valid number',
  }),
});

export const updateTransactionSchema = z.object({
  params: paramsZodSchema,
  body: bodyZodSchema,
});
