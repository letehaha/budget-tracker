import { createController } from '@controllers/helpers/controller-factory';
import { getAllSystemCurrencies } from '@services/system-currencies';
import { z } from 'zod';

const schema = z.object({});

export default createController(schema, async () => {
  const data = await getAllSystemCurrencies();

  return { data };
});
