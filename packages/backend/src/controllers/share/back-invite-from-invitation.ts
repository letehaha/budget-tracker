import { SHARE_PERMISSIONS, TRANSACTIONS_WRITE_SCOPES } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { backInviteFromInvitation } from '@services/sharing/invitations/back-invite-from-invitation.service';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
  body: z.object({
    // Household members never receive `manage` — keep the same enum the service-layer
    // (and the DB CHECK on household rows) enforces, so the user sees the zod error
    // instead of a 500 surfaced from the constraint.
    permission: z.enum([SHARE_PERMISSIONS.read, SHARE_PERMISSIONS.write] as const),
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

export default createController(schema, async ({ user, params, body }) => {
  const { invitation, emailDelivered } = await backInviteFromInvitation({
    callerUserId: user.id,
    sourceInvitationId: params.id,
    permission: body.permission,
    policy: body.policy ?? null,
  });

  return { data: { ...invitation, emailDelivered }, statusCode: 201 };
});
