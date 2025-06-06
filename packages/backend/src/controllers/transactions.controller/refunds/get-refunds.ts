import { TRANSACTION_TYPES } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { type GetRefundTransactionsParams, getRefundTransactions } from '@services/tx-refunds/get-refunds.service';
import { z } from 'zod';

const schema = z.object({
  query: z.object({
    categoryId: recordId().optional(),
    accountId: recordId().optional(),
    transactionType: z.nativeEnum(TRANSACTION_TYPES).optional(),
    page: z.coerce.number().int().positive().finite(),
    limit: z.coerce.number().int().positive().finite(),
  }),
});

export default createController(schema, async ({ user, query }) => {
  const { id: userId } = user;
  const { categoryId, transactionType, accountId, page, limit } = query;

  const filters: GetRefundTransactionsParams = { userId };

  if (categoryId) filters.categoryId = categoryId;
  if (transactionType) filters.transactionType = transactionType;
  if (accountId) filters.accountId = accountId;
  if (page) filters.page = page;
  if (limit) filters.limit = limit;

  const { rows: refundTransactions, meta } = await getRefundTransactions(filters);

  return {
    data: {
      data: refundTransactions,
      meta,
    },
  };
});
