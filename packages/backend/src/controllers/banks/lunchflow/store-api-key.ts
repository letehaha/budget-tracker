import { createController } from '@controllers/helpers/controller-factory';
import * as lunchflowService from '@services/banks/lunchflow/store-api-key';
import { z } from 'zod';

const schema = z.object({
  body: z.object({
    apiKey: z.string().min(1, 'API key is required'),
  }),
});

export default createController(schema, async ({ user, body }) => {
  const data = await lunchflowService.storeApiKey({
    userId: user.id,
    apiKey: body.apiKey,
  });

  return { data };
});
