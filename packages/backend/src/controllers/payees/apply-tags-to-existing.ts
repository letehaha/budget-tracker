import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as payeesService from '@services/payees';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const result = await payeesService.applyPayeeTagsToExisting({
    userId: user.id,
    payeeId: params.id,
  });
  return { data: result };
});
