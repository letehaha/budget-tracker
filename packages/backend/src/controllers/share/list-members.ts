import { RESOURCE_TYPES } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { listMembers } from '@services/sharing/members/list-members.service';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    resourceType: z.enum([RESOURCE_TYPES.account] as const),
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
