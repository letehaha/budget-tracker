import { booleanQuery, recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { getVentureDeal } from '@services/venture/deals/get.service';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({ id: recordId() }),
    query: z
      .object({
        includeEvents: booleanQuery().optional(),
      })
      .optional(),
  }),
  async ({ user, params, query }) => {
    const deal = await getVentureDeal({
      userId: user.id,
      dealId: params.id,
      includeEvents: query?.includeEvents,
    });
    return { data: deal };
  },
);
