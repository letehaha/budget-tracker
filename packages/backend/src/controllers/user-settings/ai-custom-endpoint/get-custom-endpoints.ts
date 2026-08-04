import { createController } from '@controllers/helpers/controller-factory';
import { getCustomEndpointInfos } from '@services/user-settings/ai-custom-endpoint';
import { z } from 'zod';

const schema = z.object({});

export const getCustomEndpointsController = createController(schema, async ({ user }) => {
  const { id: userId } = user;

  const endpoints = await getCustomEndpointInfos({ userId });

  return { data: endpoints };
});
