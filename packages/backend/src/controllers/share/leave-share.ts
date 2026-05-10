import { RESOURCE_TYPES } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { leaveShare } from '@services/sharing/members/leave-share.service';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    resourceType: z.enum([RESOURCE_TYPES.account] as const),
    resourceId: z.string().min(1).max(255),
  }),
});

export default createController(schema, async ({ user, params }) => {
  await leaveShare({
    callerUserId: user.id,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
  });
  return { statusCode: 204 };
});
