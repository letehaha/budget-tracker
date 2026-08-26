import { createController } from '@controllers/helpers/controller-factory';
import { trackAutomationCreated } from '@js/utils/posthog';
import { createAutomation } from '@services/transaction-automations/create-automation';
import { createAutomationBodySchema } from '@services/transaction-automations/zod-schemas';
import { z } from 'zod';

const schema = z.object({ body: createAutomationBodySchema });

export default createController(schema, async ({ user, body }) => {
  const data = await createAutomation({ userId: user.id, ...body });

  trackAutomationCreated({
    userId: user.id,
    source: 'api',
    conditions: data.conditions,
    actions: data.actions,
  });

  return { data, statusCode: 201 };
});
