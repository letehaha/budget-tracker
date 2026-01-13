import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeTransaction, serializeTransactions } from '@root/serializers';
import * as transactionsService from '@services/transactions';
import { z } from 'zod';

export const getTransactionById = createController(
  z.object({
    params: z.object({
      id: recordId(),
    }),
    query: z.object({
      includeSplits: z.boolean().optional(),
    }),
  }),
  async ({ user, params, query }) => {
    const { id } = params;
    const { id: userId } = user;
    const { includeSplits } = query;

    const transaction = await transactionsService.getTransactionById({
      id,
      userId,
      includeSplits,
    });

    // Serialize: convert cents to decimal for API response
    return { data: transaction ? serializeTransaction(transaction) : null };
  },
);

export const getTransactionsByTransferId = createController(
  z.object({
    params: z.object({
      transferId: z.string(),
    }),
  }),
  async ({ user, params }) => {
    const { transferId } = params;
    const { id: userId } = user;

    const transactions = await transactionsService.getTransactionsByTransferId({
      transferId,
      userId,
    });

    // Serialize: convert cents to decimal for API response
    return { data: serializeTransactions(transactions) };
  },
);

export * from './transactions.controller/index';
