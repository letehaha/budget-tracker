import { createController } from '@controllers/helpers/controller-factory';
import { getTransactionTemplates } from '@services/transaction-templates';
import { z } from 'zod';

export default createController(z.object({}), async ({ user }) => {
  const data = await getTransactionTemplates({ userId: user.id });

  return { data };
});
