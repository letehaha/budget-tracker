import { RESOURCE_TYPES } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { revokeMember } from '@services/sharing/members/revoke-member.service';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    resourceType: z.enum([RESOURCE_TYPES.account] as const),
    resourceId: z.string().min(1).max(255),
    userId: z.coerce.number().int().positive(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  await revokeMember({
    callerUserId: user.id,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    memberUserId: params.userId,
  });
  return { statusCode: 204 };
});
