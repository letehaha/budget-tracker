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
  const { invitation, emailOutcome } = await resendInvitation({
    invitationId: params.id,
    ownerUserId: user.id,
  });
  // `emailOutcome` lets the frontend tell the user when the row was updated but no email
  // went out. The rate-limit slot was already consumed, so swallowing this would mean the
  // user burns their 24h attempts without ever delivering a message.
  return { data: { ...invitation, emailOutcome } };
});
