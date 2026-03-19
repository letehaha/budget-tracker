import { createController } from '@controllers/helpers/controller-factory';
import { removeAllAiApiKeys } from '@services/user-settings/ai-api-key';
import { z } from 'zod';

const schema = z.object({});

export const deleteAllAiApiKeys = createController(schema, async ({ user }) => {
  const { id: userId } = user;

  await removeAllAiApiKeys({ userId });

  return {
    data: {
      success: true,
    },
  };
});
