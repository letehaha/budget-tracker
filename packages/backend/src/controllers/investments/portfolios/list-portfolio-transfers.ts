import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { listPortfolioTransfers } from '@services/investments/portfolios/transfers';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      id: recordId(),
    }),
    query: z
      .object({
        dateFrom: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be in YYYY-MM-DD format' })
          .optional(),
        dateTo: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be in YYYY-MM-DD format' })
          .optional(),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        offset: z.coerce.number().int().min(0).default(0),
        page: z.coerce.number().int().min(1).optional(),
        sortBy: z.enum(['date', 'amount']).default('date'),
        sortDirection: z.enum(['ASC', 'DESC']).default('DESC'),
      })
      .transform((data) => {
        // Convert page to offset if page is provided
        if (data.page !== undefined) {
          data.offset = (data.page - 1) * data.limit;
        }
        return data;
      }),
  }),
  async ({ user, params, query }) => {
    const result = await listPortfolioTransfers({
      userId: user.id,
      portfolioId: params.id,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      limit: query.limit,
      offset: query.offset,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
    });

    return {
      data: {
        data: result.data,
        pagination: {
          limit: query.limit,
          offset: query.offset,
          page: query.page || Math.floor(query.offset / query.limit) + 1,
          totalCount: result.totalCount,
        },
      },
    };
  },
);
