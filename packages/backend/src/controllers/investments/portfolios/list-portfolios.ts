import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
import { booleanQuery } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { listPortfolios } from '@services/investments/portfolios/list.service';
import { z } from 'zod';

export default createController(
  z.object({
    query: z
      .object({
        portfolioType: z.nativeEnum(PORTFOLIO_TYPE).optional(),
        isEnabled: booleanQuery().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        offset: z.coerce.number().int().min(0).default(0),
        page: z.coerce.number().int().min(1).optional(),
      })
      .transform((data) => {
        // Convert page to offset if page is provided
        if (data.page !== undefined) {
          data.offset = (data.page - 1) * data.limit;
        }
        return data;
      }),
  }),
  async ({ user, query }) => {
    const portfolios = await listPortfolios({
      userId: user.id,
      portfolioType: query.portfolioType,
      isEnabled: query.isEnabled,
      limit: query.limit,
      offset: query.offset,
    });

    return {
      data: {
        data: portfolios,
        pagination: {
          limit: query.limit,
          offset: query.offset,
          page: query.page || Math.floor(query.offset / query.limit) + 1,
        },
      },
    };
  },
);
