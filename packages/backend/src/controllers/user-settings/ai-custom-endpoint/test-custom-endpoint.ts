import { createController } from '@controllers/helpers/controller-factory';
import { testCustomEndpointConnection } from '@services/user-settings/ai-custom-endpoint';
import { z } from 'zod';

import { apiKeyField, baseUrlField, defaultModelField } from './endpoint-field-schemas';

// Re-test a saved endpoint. Omitted fields fall back to the stored values,
// including the key, so the UI never resends secrets.
const savedEndpointBody = z.object({
  endpointId: z.uuid(),
  baseUrl: baseUrlField.optional(),
  defaultModel: defaultModelField.optional(),
  apiKey: apiKeyField.optional(),
});

// Test a combination the user typed in, before it is saved anywhere.
const typedEndpointBody = z.object({
  baseUrl: baseUrlField,
  defaultModel: defaultModelField,
  apiKey: apiKeyField.optional(),
});

const schema = z.object({
  body: z.union([savedEndpointBody, typedEndpointBody]),
});

export const testCustomEndpointController = createController(schema, async ({ user, body }) => {
  const { id: userId } = user;
  const { baseUrl, defaultModel, apiKey } = body;
  const endpointId = 'endpointId' in body ? body.endpointId : undefined;

  const result = await testCustomEndpointConnection({ userId, endpointId, baseUrl, defaultModel, apiKey });

  return { data: result };
});
