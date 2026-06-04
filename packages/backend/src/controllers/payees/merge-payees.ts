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
    targetPayeeId: recordId(),
  }),
});

export default createController(schema, async ({ user, params, body }) => {
  const target = await payeesService.mergePayees({
    userId: user.id,
    sourceId: params.id,
    targetId: body.targetPayeeId,
  });
  return { data: serializePayee(target) };
});
