import { createController } from '@controllers/helpers/controller-factory';
import { applyAutomationToHistory } from '@services/transaction-automations/apply-to-history';
import { applyAutomationBodySchema, automationIdParamsSchema } from '@services/transaction-automations/zod-schemas';
import { z } from 'zod';

const schema = z.object({ params: automationIdParamsSchema, body: applyAutomationBodySchema });

export default createController(schema, async ({ user, params, body }) => {
  const data = await applyAutomationToHistory({
    userId: user.id,
    ruleId: params.id,
    transactionIds: body.transactionIds,
  });
  return { data };
});
