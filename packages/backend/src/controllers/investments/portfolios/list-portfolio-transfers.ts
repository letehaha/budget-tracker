import { dateRange, recordId, withDateOrder } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { applyPaginationTransform, buildPagination, paginationFields } from '@controllers/helpers/pagination';
import { listPortfolioTransfers } from '@services/investments/portfolios/transfers';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      id: recordId(),
    }),
    query: withDateOrder(
      z.object({
        ...dateRange(),
        sortBy: z.enum(['date', 'amount']).default('date'),
        sortDirection: z.enum(['ASC', 'DESC']).default('DESC'),
        ...paginationFields,
      }),
    ).transform(applyPaginationTransform),
  }),
  async ({ user, params, query }) => {
    const result = await listPortfolioTransfers({
      userId: user.id,
      portfolioId: params.id,
      from: query.from,
      to: query.to,
      limit: query.limit,
      offset: query.offset,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
    });

    return {
      data: {
        data: result.data,
        pagination: buildPagination(query, { totalCount: result.totalCount }),
      },
    };
  },
);
