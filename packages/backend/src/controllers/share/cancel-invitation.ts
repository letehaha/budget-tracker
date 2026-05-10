import { createController } from '@controllers/helpers/controller-factory';
import { cancelInvitation } from '@services/sharing/invitations/cancel-invitation.service';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const { invitation } = await cancelInvitation({
    invitationId: params.id,
    ownerUserId: user.id,
  });
  return { data: invitation };
});
