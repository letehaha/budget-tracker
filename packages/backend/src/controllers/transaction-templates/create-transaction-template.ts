import { createController } from '@controllers/helpers/controller-factory';
import { createTransactionTemplate } from '@services/transaction-templates';
import { z } from 'zod';

import { templateBodySchema } from './schema';

const schema = z.object({
  body: templateBodySchema,
});

export default createController(schema, async ({ user, body }) => {
  const data = await createTransactionTemplate({ userId: user.id, ...body });

  return { data, statusCode: 201 };
});
