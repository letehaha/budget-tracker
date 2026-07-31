import { AI_KEY_PROVIDERS } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { setAiApiKey } from '@services/user-settings/ai-api-key';
import { z } from 'zod';

const schema = z.object({
  body: z.object({
    apiKey: z.string().min(1).max(2056),
    // `custom` is not a key provider — it has its own /settings/ai/custom-endpoints routes
    provider: z.enum(AI_KEY_PROVIDERS),
  }),
});

export const setAiApiKeyController = createController(schema, async ({ user, body }) => {
  const { id: userId } = user;
  const { apiKey, provider } = body;

  await setAiApiKey({ userId, apiKey, provider });

  return {
    data: {
      success: true,
    },
  };
});
