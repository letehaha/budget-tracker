import { createController } from '@controllers/helpers/controller-factory';
import { listVenturePlatforms } from '@services/venture/platforms/list.service';
import { z } from 'zod';

export default createController(
  z.object({
    query: z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(20),
        offset: z.coerce.number().int().min(0).default(0),
        page: z.coerce.number().int().min(1).optional(),
      })
      .transform((data) => {
        if (data.page !== undefined) {
          data.offset = (data.page - 1) * data.limit;
        }
        return data;
      }),
  }),
  async ({ user, query }) => {
    const platforms = await listVenturePlatforms({
      userId: user.id,
      limit: query.limit,
      offset: query.offset,
    });

    return {
      data: {
        data: platforms,
        pagination: {
          limit: query.limit,
          offset: query.offset,
          page: query.page || Math.floor(query.offset / query.limit) + 1,
        },
      },
    };
  },
);
