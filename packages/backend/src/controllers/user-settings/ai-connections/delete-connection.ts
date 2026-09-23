import { createController } from '@controllers/helpers/controller-factory';
import { deleteConnection } from '@services/user-settings/ai-connections';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: z.uuid(),
  }),
});

export const deleteConnectionController = createController(schema, async ({ user, params }) => {
  await deleteConnection({ userId: user.id, connectionId: params.id });

  return {
    data: {
      success: true,
    },
  };
});
