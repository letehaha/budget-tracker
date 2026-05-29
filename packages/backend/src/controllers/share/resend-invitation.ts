import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { resendInvitation } from '@services/sharing/invitations/resend-invitation.service';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const { invitation, emailDelivered } = await resendInvitation({
    invitationId: params.id,
    ownerUserId: user.id,
  });
  // `emailDelivered` lets the frontend warn the user when the row was updated but the
  // email never made it out (Resend down, etc.). The rate-limit slot was already
  // consumed, so silently swallowing this would mean the user burns 3 attempts in 24h
  // without ever delivering a message.
  return { data: { ...invitation, emailDelivered } };
});
