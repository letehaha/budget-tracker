import { createController } from '@controllers/helpers/controller-factory';
import { listAutomations } from '@services/transaction-automations/list-automations';
import { z } from 'zod';

export default createController(z.object({}), async ({ user }) => {
  const data = await listAutomations({ userId: user.id });
  return { data };
});
