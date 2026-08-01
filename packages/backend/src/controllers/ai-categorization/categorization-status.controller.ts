import { createController } from '@controllers/helpers/controller-factory';
import { getCategorizationStatus } from '@services/ai-categorization';
import { z } from 'zod';

const schema = z.object({});

export const categorizationStatusController = createController(schema, async ({ user, res }) => {
  res.setHeader('Cache-Control', 'no-store');
  const status = await getCategorizationStatus({ userId: user.id });
  return { data: status };
});
