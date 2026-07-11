import { dateRange, recordId, withDateOrder } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { getPrices } from '@root/services/investments/securities-price/get-prices.service';
import { z } from 'zod';

export default createController(
  z.object({
    query: withDateOrder(z.object({ ...dateRange({ precision: 'datetime' }), securityId: recordId().optional() })),
  }),
  async (req) => {
    const { securityId, from, to } = req.query;

    const prices = await getPrices({
      securityId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });

    return { data: prices };
  },
);
