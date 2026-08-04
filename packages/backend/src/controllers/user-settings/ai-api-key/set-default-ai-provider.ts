import { AI_KEY_PROVIDERS } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { setDefaultAiProvider } from '@services/user-settings/ai-api-key';
import { z } from 'zod';

const schema = z.object({
  body: z.object({
    provider: z.enum(AI_KEY_PROVIDERS),
  }),
});

export const setDefaultAiProviderController = createController(schema, async ({ user, body }) => {
  const { id: userId } = user;
  const { provider } = body;

  await setDefaultAiProvider({ userId, provider });

  return {
    data: {
      success: true,
    },
  };
});
