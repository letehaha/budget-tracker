import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as payeesService from '@services/payees';
import { z } from 'zod';

import { serializePayeeWithStats } from './serializer';

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const { payee, stats } = await payeesService.getPayee({ userId: user.id, id: params.id });
  return { data: serializePayeeWithStats({ payee, stats }) };
});
