import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { updateTransactionTemplate } from '@services/transaction-templates';
import { z } from 'zod';

import { templateBodySchema } from './schema';

const schema = z.object({
  params: z.object({ id: recordId() }),
  body: templateBodySchema.partial(),
});

export default createController(schema, async ({ user, params, body }) => {
  const data = await updateTransactionTemplate({ id: params.id, userId: user.id, ...body });

  return { data };
});
