import { VENTURE_DEAL_STATUS } from '@bt/shared/types/venture';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { listVentureDeals } from '@services/venture/deals/list.service';
import { z } from 'zod';

export default createController(
  z.object({
    query: z
      .object({
        status: z.nativeEnum(VENTURE_DEAL_STATUS).optional(),
        platformId: recordId().optional(),
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
    const deals = await listVentureDeals({
      userId: user.id,
      status: query.status,
      platformId: query.platformId,
      limit: query.limit,
      offset: query.offset,
    });

    return {
      data: {
        data: deals,
        pagination: {
          limit: query.limit,
          offset: query.offset,
          page: query.page || Math.floor(query.offset / query.limit) + 1,
        },
      },
    };
  },
);
