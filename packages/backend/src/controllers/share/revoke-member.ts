import { createController } from '@controllers/helpers/controller-factory';
import { revokeMember } from '@services/sharing/members/revoke-member.service';
import { z } from 'zod';

import { shareableResourceTypeEnum } from './_zod';

const schema = z.object({
  params: z.object({
    resourceType: shareableResourceTypeEnum,
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
