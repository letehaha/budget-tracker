import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as payeesService from '@services/payees';
import { z } from 'zod';

import { serializePayee } from './serializer';

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
  body: z.object({
    rawName: z.string().trim().min(1).max(500),
  }),
});

export default createController(schema, async ({ user, params, body }) => {
  const payee = await payeesService.createPayeeAlias({
    userId: user.id,
    payeeId: params.id,
    rawName: body.rawName,
  });
  return { data: serializePayee(payee), statusCode: 201 };
});
