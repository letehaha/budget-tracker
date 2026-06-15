import { CATEGORIZATION_MODE } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as payeesService from '@services/payees';
import { z } from 'zod';

import { serializePayee } from './serializer';

// Domain string: no protocol, no spaces, no slashes, max 253 chars (RFC 1035).
// null is valid — the user explicitly wants no logo while keeping manual source.
const logoDomainSchema = z
  .string()
  .trim()
  .max(253)
  .regex(/^[^\s/]+$/, 'logoDomain must not contain spaces or slashes')
  .nullable();

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
  body: z.object({
    name: z.string().trim().min(1).max(200).optional(),
    defaultCategoryId: recordId().nullable().optional(),
    categorizationMode: z.nativeEnum(CATEGORIZATION_MODE).optional(),
    defaultTagIds: z.array(recordId()).optional(),
    // Present key (even null) → manual override; absent key → no change.
    logoDomain: logoDomainSchema.optional(),
  }),
});

export default createController(schema, async ({ user, params, body }) => {
  const payee = await payeesService.updatePayee({
    userId: user.id,
    id: params.id,
    name: body.name,
    defaultCategoryId: body.defaultCategoryId,
    categorizationMode: body.categorizationMode,
    defaultTagIds: body.defaultTagIds,
    // Pass undefined when the key was absent (Zod treats missing optional as
    // undefined), so the service can distinguish "set manual" from "leave alone".
    logoDomain: body.logoDomain,
  });
  return { data: serializePayee(payee) };
});
