import { API_RESPONSE_STATUS, TRANSACTION_TYPES } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { CustomResponse } from '@common/types';
import { errorHandler } from '@controllers/helpers';
import { type GetRefundTransactionsParams, getRefundTransactions } from '@services/tx-refunds/get-refunds.service';
import { z } from 'zod';

export async function getRefunds(req, res: CustomResponse) {
  try {
    const { id: userId } = req.user;
    const { categoryId, transactionType, accountId, page, limit }: GetRefundsSchemaParams['query'] =
      req.validated.query;
    const filters: GetRefundTransactionsParams = { userId };

    if (categoryId) filters.categoryId = categoryId;
    if (transactionType) filters.transactionType = transactionType;
    if (accountId) filters.accountId = accountId;

    if (page) filters.page = page;
    if (limit) filters.limit = limit;

    const { rows: refundTransactions, meta } = await getRefundTransactions(filters);

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: {
        data: refundTransactions,
        meta,
      },
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
}

export const getRefundsSchema = z.object({
  query: z.object({
    categoryId: recordId().optional(),
    accountId: recordId().optional(),
    transactionType: z.nativeEnum(TRANSACTION_TYPES).optional(),
    page: z.coerce.number().int().positive().finite(),
    limit: z.coerce.number().int().positive().finite(),
  }),
});

type GetRefundsSchemaParams = z.infer<typeof getRefundsSchema>;
