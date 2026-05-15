import { createController } from '@controllers/helpers/controller-factory';
import { listMembers } from '@services/sharing/members/list-members.service';
import { z } from 'zod';

import { shareableResourceTypeEnum } from './_zod';

const schema = z.object({
  params: z.object({
    resourceType: shareableResourceTypeEnum,
    resourceId: z.string().min(1).max(255),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const data = await listMembers({
    userId: user.id,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
  });
  return { data };
});
