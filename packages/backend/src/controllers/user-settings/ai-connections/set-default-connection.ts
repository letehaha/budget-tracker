import { createController } from '@controllers/helpers/controller-factory';
import { setDefaultConnection } from '@services/user-settings/ai-connections';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: z.uuid(),
  }),
});

export const setDefaultConnectionController = createController(schema, async ({ user, params }) => {
  const connections = await setDefaultConnection({ userId: user.id, connectionId: params.id });

  return { data: connections };
});
