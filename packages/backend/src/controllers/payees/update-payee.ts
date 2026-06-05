import { CATEGORIZATION_MODE } from '@bt/shared/types';
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
    name: z.string().trim().min(1).max(200).optional(),
    defaultCategoryId: recordId().nullable().optional(),
    categorizationMode: z.nativeEnum(CATEGORIZATION_MODE).optional(),
  }),
});

export default createController(schema, async ({ user, params, body }) => {
  const payee = await payeesService.updatePayee({
    userId: user.id,
    id: params.id,
    name: body.name,
    defaultCategoryId: body.defaultCategoryId,
    categorizationMode: body.categorizationMode,
  });
  return { data: serializePayee(payee) };
});
