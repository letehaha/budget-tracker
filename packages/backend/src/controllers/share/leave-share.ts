import { createController } from '@controllers/helpers/controller-factory';
import { leaveShare } from '@services/sharing/members/leave-share.service';
import { z } from 'zod';

import { shareableResourceTypeEnum } from './_zod';

const schema = z.object({
  params: z.object({
    resourceType: shareableResourceTypeEnum,
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
