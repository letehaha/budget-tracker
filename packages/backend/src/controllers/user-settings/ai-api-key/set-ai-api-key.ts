import { AI_PROVIDER } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { setAiApiKey } from '@services/user-settings/ai-api-key';
import { z } from 'zod';

const schema = z.object({
  body: z.object({
    apiKey: z.string().min(1).max(2056),
    provider: z.nativeEnum(AI_PROVIDER),
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
