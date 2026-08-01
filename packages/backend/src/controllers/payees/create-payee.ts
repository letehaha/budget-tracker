import { CATEGORIZATION_MODE } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { logoDomainSchema } from '@controllers/common/logo-domain.schema';
import { logoColorSchema, logoInitialsSchema, refineLogoSelection } from '@controllers/common/logo-initials.schema';
import { createController } from '@controllers/helpers/controller-factory';
import * as payeesService from '@services/payees';
import { z } from 'zod';

import { serializePayee } from './serializer';

const schema = z.object({
  body: z
    .object({
      name: z.string().trim().min(1, 'Name is required').max(200, 'Name must not exceed 200 characters'),
      defaultCategoryId: recordId().nullable().optional(),
      categorizationMode: z.nativeEnum(CATEGORIZATION_MODE).optional(),
      defaultTagIds: z.array(recordId()).optional(),
      // Present key (even null) → manual override on the new Payee; absent key →
      // leave the logo unset so the background resolver auto-resolves it.
      logoDomain: logoDomainSchema.optional(),
      // Monogram letters + background, the alternative to a brand domain.
      logoInitials: logoInitialsSchema.optional(),
      logoColor: logoColorSchema.optional(),
    })
    .superRefine((data, ctx) => refineLogoSelection({ data, ctx })),
});

export default createController(schema, async ({ user, body }) => {
  const payee = await payeesService.createPayee({
    userId: user.id,
    name: body.name,
    defaultCategoryId: body.defaultCategoryId ?? null,
    categorizationMode: body.categorizationMode,
    defaultTagIds: body.defaultTagIds,
    logoDomain: body.logoDomain,
    logoInitials: body.logoInitials,
    logoColor: body.logoColor,
  });
  return { data: serializePayee(payee), statusCode: 201 };
});
