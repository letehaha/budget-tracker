import { AI_CUSTOM_ENDPOINT_NAME_MAX_LENGTH } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { createCustomEndpoint } from '@services/user-settings/ai-custom-endpoint';
import { z } from 'zod';

import { apiKeyField, baseUrlField, defaultModelField } from './endpoint-field-schemas';

const schema = z.object({
  body: z.object({
    name: z.string().min(1).max(AI_CUSTOM_ENDPOINT_NAME_MAX_LENGTH),
    baseUrl: baseUrlField,
    defaultModel: defaultModelField,
    // Omitted or null means the endpoint needs no authentication
    apiKey: apiKeyField.optional().nullable(),
  }),
});

export const createCustomEndpointController = createController(schema, async ({ user, body }) => {
  const { id: userId } = user;
  const { name, baseUrl, defaultModel, apiKey } = body;

  const endpoint = await createCustomEndpoint({ userId, name, baseUrl, defaultModel, apiKey });

  return { data: endpoint, statusCode: 201 };
});
