import { createController } from '@controllers/helpers/controller-factory';
import { deleteCustomEndpoint } from '@services/user-settings/ai-custom-endpoint';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: z.uuid(),
  }),
});

export const deleteCustomEndpointController = createController(schema, async ({ user, params }) => {
  const { id: userId } = user;
  const { id: endpointId } = params;

  await deleteCustomEndpoint({ userId, endpointId });

  return {
    data: {
      success: true,
    },
  };
});
