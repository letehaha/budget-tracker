import { SHARING_LIMITS } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { acceptInvitation } from '@services/sharing/invitations/accept-invitation.service';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    token: z.string().length(SHARING_LIMITS.invitationTokenLength),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const data = await acceptInvitation({ token: params.token, userId: user.id });
  return { data };
});
