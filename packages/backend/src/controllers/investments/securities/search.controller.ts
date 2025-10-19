import { createController } from '@controllers/helpers/controller-factory';
import { searchSecurities } from '@services/investments/securities/search.service';
import { z } from 'zod';

export default createController(
  z.object({
    query: z.object({
      query: z.string().min(1, 'Search query cannot be empty.'),
      limit: z.coerce.number().int().positive().optional(),
      portfolioId: z.coerce.number().int().positive().optional(),
    }),
  }),
  async ({ user, query }) => {
    const securities = await searchSecurities({
      query: query.query,
      limit: query.limit,
      portfolioId: query.portfolioId,
      user,
    });
    return { data: securities };
  },
);
