import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
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

    const data = await transactionsService.getTransactionById({
      id,
      userId,
      includeSplits,
    });

    return { data };
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

    const data = await transactionsService.getTransactionsByTransferId({
      transferId,
      userId,
    });

    return { data };
  },
);

export * from './transactions.controller/index';
