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
      includeUser: z.boolean().optional(),
      includeAccount: z.boolean().optional(),
      includeCategory: z.boolean().optional(),
      includeAll: z.boolean().optional(),
      nestedInclude: z.boolean().optional(),
    }),
  }),
  async ({ user, params, query }) => {
    const { id } = params;
    const { id: userId } = user;
    const { includeUser, includeAccount, includeCategory, includeAll, nestedInclude } = query;

    const data = await transactionsService.getTransactionById({
      id,
      userId,
      includeUser,
      includeAccount,
      includeCategory,
      includeAll,
      nestedInclude,
    });

    return { data };
  },
);

export const getTransactionsByTransferId = createController(
  z.object({
    params: z.object({
      transferId: z.number(),
    }),
    query: z.object({
      includeUser: z.boolean().optional(),
      includeAccount: z.boolean().optional(),
      includeCategory: z.boolean().optional(),
      includeAll: z.boolean().optional(),
      nestedInclude: z.boolean().optional(),
    }),
  }),
  async ({ user, params, query }) => {
    const { transferId } = params;
    const { id: userId } = user;
    const { includeUser, includeAccount, includeCategory, includeAll, nestedInclude } = query;

    const data = await transactionsService.getTransactionsByTransferId({
      transferId,
      userId,
      includeUser,
      includeAccount,
      includeCategory,
      includeAll,
      nestedInclude,
    });

    return { data };
  },
);

export * from './transactions.controller/index';
