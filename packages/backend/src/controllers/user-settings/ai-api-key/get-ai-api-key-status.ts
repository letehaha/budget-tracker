import { createController } from '@controllers/helpers/controller-factory';
import { getAiApiKeyInfo, hasAiApiKey } from '@services/user-settings/ai-api-key';
import { z } from 'zod';

const schema = z.object({});

export const getAiApiKeyStatus = createController(schema, async ({ user }) => {
  const { id: userId } = user;

  const info = await getAiApiKeyInfo({ userId });
  const hasKey = await hasAiApiKey({ userId });

  return {
    data: {
      hasApiKey: hasKey,
      providers: info.providers,
      defaultProvider: info.defaultProvider,
    },
  };
});
