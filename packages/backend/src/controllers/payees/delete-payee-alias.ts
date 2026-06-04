import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as payeesService from '@services/payees';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
    aliasId: recordId(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  await payeesService.deletePayeeAlias({
    userId: user.id,
    payeeId: params.id,
    aliasId: params.aliasId,
  });
  return { statusCode: 204 };
});
