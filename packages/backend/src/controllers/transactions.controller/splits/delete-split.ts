import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { deleteSplit } from '@services/transactions/splits';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    splitId: recordId(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const { splitId } = params;
  const { id: userId } = user;

  await deleteSplit({ splitId, userId });
});
