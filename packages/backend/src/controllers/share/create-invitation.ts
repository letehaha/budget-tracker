import { RESOURCE_TYPES, SHARE_PERMISSIONS, TRANSACTIONS_WRITE_SCOPES } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { createInvitation } from '@services/sharing/invitations/create-invitation.service';
import { z } from 'zod';

const schema = z.object({
  body: z.object({
    inviteeEmail: z.string().email().max(320).trim(),
    resourceType: z.enum([RESOURCE_TYPES.account] as const),
    resourceId: z.union([z.number().int().positive(), z.string().min(1).max(255)]),
    permission: z.enum([SHARE_PERMISSIONS.read, SHARE_PERMISSIONS.write, SHARE_PERMISSIONS.manage] as const),
    policy: z
      .object({
        transactionsWriteScope: z
          .enum([TRANSACTIONS_WRITE_SCOPES.all, TRANSACTIONS_WRITE_SCOPES.own] as const)
          .optional(),
      })
      .nullable()
      .optional(),
  }),
});

export default createController(schema, async ({ user, body }) => {
  const { invitation } = await createInvitation({
    ownerUserId: user.id,
    inviteeEmail: body.inviteeEmail,
    resourceType: body.resourceType,
    resourceId: body.resourceId,
    permission: body.permission,
    policy: body.policy ?? null,
  });

  return { data: invitation, statusCode: 201 };
});
