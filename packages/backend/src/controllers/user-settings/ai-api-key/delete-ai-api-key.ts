import { AI_PROVIDER } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { setAiApiKey } from '@services/user-settings/ai-api-key';
import { z } from 'zod';

const schema = z.object({
  body: z.object({
    provider: z.nativeEnum(AI_PROVIDER),
  }),
});

export const deleteAiApiKey = createController(schema, async ({ user, body }) => {
  const { id: userId } = user;
  const { provider } = body;

  await setAiApiKey({ userId, apiKey: null, provider });

  return {
    data: {
      success: true,
    },
  };
});
