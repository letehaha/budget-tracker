import { RESOURCE_TYPES, SHARE_PERMISSIONS, TRANSACTIONS_WRITE_SCOPES } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { updateMember } from '@services/sharing/members/update-member.service';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    resourceType: z.enum([RESOURCE_TYPES.account] as const),
    resourceId: z.string().min(1).max(255),
    userId: z.coerce.number().int().positive(),
  }),
  body: z
    .object({
      permission: z
        .enum([SHARE_PERMISSIONS.read, SHARE_PERMISSIONS.write, SHARE_PERMISSIONS.manage] as const)
        .optional(),
      policy: z
        .object({
          transactionsWriteScope: z
            .enum([TRANSACTIONS_WRITE_SCOPES.all, TRANSACTIONS_WRITE_SCOPES.own] as const)
            .optional(),
        })
        .nullable()
        .optional(),
    })
    .refine((data) => data.permission !== undefined || data.policy !== undefined, {
      message: 'At least one of `permission` or `policy` must be provided.',
    }),
});

export default createController(schema, async ({ user, params, body }) => {
  const { share } = await updateMember({
    callerUserId: user.id,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    memberUserId: params.userId,
    permission: body.permission,
    policy: body.policy,
  });
  return { data: share };
});
