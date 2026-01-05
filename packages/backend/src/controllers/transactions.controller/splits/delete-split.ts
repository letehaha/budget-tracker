import { createController } from '@controllers/helpers/controller-factory';
import { deleteSplit } from '@services/transactions/splits';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    splitId: z.string().uuid(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const { splitId } = params;
  const { id: userId } = user;

  await deleteSplit({ splitId, userId });
});
