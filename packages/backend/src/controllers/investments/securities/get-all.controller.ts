import { createController } from '@controllers/helpers/controller-factory';
import * as securitiesService from '@services/investments/securities/get-all';
import { z } from 'zod';

export default createController(z.object({}), async () => {
  const data = await securitiesService.getSecurities();
  return { data };
});
