import { createController } from '@controllers/helpers/controller-factory';
import { updateCustomEndpoint } from '@services/user-settings/ai-custom-endpoint';
import { z } from 'zod';

import { apiKeyField, baseUrlField, defaultModelField, nameField } from './endpoint-field-schemas';

const schema = z.object({
  params: z.object({
    id: z.uuid(),
  }),
  body: z.object({
    name: nameField.optional(),
    baseUrl: baseUrlField.optional(),
    defaultModel: defaultModelField.optional(),
    // Omitted keeps the stored key, null removes it, a string replaces it
    apiKey: apiKeyField.optional().nullable(),
  }),
});

export const updateCustomEndpointController = createController(schema, async ({ user, params, body }) => {
  const { id: userId } = user;
  const { id: endpointId } = params;
  const { name, baseUrl, defaultModel, apiKey } = body;

  const endpoint = await updateCustomEndpoint({ userId, endpointId, name, baseUrl, defaultModel, apiKey });

  return { data: endpoint };
});
