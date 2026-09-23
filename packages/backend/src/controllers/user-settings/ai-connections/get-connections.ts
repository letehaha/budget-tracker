import { createController } from '@controllers/helpers/controller-factory';
import { getConnectionInfos } from '@services/user-settings/ai-connections';
import { z } from 'zod';

const schema = z.object({});

export const getConnectionsController = createController(schema, async ({ user }) => {
  const connections = await getConnectionInfos({ userId: user.id });

  return { data: connections };
});
