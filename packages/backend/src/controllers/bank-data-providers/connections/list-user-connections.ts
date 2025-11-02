import { createController } from '@controllers/helpers/controller-factory';
import { listUserConnections } from '@root/services/bank-data-providers/connection/list-user-connections';
import { z } from 'zod';

export default createController(z.object({}), async ({ user }) => {
  const connections = await listUserConnections({ userId: user.id });

  return {
    data: {
      connections,
    },
  };
});
