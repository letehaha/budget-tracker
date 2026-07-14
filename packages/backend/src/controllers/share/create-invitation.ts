import { SHARE_PERMISSIONS, TRANSACTIONS_WRITE_SCOPES } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { createInvitation } from '@services/sharing/invitations/create-invitation.service';
import { z } from 'zod';

import { shareableResourceTypeEnum } from './_zod';

const schema = z.object({
  body: z.object({
    inviteeEmail: z.string().email().max(320).trim(),
    resourceType: shareableResourceTypeEnum,
    resourceId: z.union([z.coerce.number().int().positive(), recordId()]),
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
  const { invitation, emailDelivered } = await createInvitation({
    ownerUserId: user.id,
    inviteeEmail: body.inviteeEmail,
    resourceType: body.resourceType,
    resourceId: body.resourceId,
    permission: body.permission,
    policy: body.policy ?? null,
  });

  // `emailDelivered` lets the frontend warn the owner when the row was created but the
  // email never made it out (Resend down, etc.) — without it, users see "success" and
  // never learn the invitee never received anything.
  return { data: { ...invitation, emailDelivered }, statusCode: 201 };
});
