import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { getPrices } from '@root/services/investments/securities-price/get-prices.service';
import { z } from 'zod';

export default createController(
  z.object({
    query: z.object({
      securityId: recordId().optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
    }),
  }),
  async (req) => {
    const { securityId, startDate, endDate } = req.query;

    const prices = await getPrices({
      securityId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    return { data: prices };
  },
);
