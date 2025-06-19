import { createController } from '@controllers/helpers/controller-factory';
import { syncDailyPrices } from '@services/investments/securities-price/price-sync.service';
import { z } from 'zod';

export default createController(
  z.object({
    body: z
      .object({
        // Allow overriding the date for testing purposes
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
          .optional(),
      })
      .optional(),
  }),
  async (req) => {
    const forDate = req.body?.date ? new Date(req.body.date) : undefined;

    const result = await syncDailyPrices(forDate);

    return {
      data: result,
    };
  },
);
