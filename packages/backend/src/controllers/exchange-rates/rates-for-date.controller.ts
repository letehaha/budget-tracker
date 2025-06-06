import { createController } from '@controllers/helpers/controller-factory';
import * as getExchangeRatesService from '@services/exchange-rates';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
});

export default createController(schema, async ({ params }) => {
  const { date } = params;

  const data = await getExchangeRatesService.getExchangeRatesForDate({
    date,
  });

  return { data, statusCode: 201 };
});
