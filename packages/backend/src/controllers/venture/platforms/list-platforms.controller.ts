import { createController } from '@controllers/helpers/controller-factory';
import { applyPaginationTransform, buildPagination, paginationFields } from '@controllers/helpers/pagination';
import { serializeVenturePlatforms } from '@root/serializers';
import { listVenturePlatforms } from '@services/venture/platforms/list.service';
import { z } from 'zod';

export default createController(
  z.object({
    query: z.object(paginationFields).transform(applyPaginationTransform),
  }),
  async ({ user, query }) => {
    const platforms = await listVenturePlatforms({
      userId: user.id,
      limit: query.limit,
      offset: query.offset,
    });

    return {
      data: {
        data: serializeVenturePlatforms(platforms),
        pagination: buildPagination(query),
      },
    };
  },
);
