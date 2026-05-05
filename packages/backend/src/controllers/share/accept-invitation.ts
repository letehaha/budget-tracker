import { createController } from '@controllers/helpers/controller-factory';
import { acceptInvitation } from '@services/sharing/accept-invitation.service';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    token: z.string().min(1).max(64),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const data = await acceptInvitation({ token: params.token, userId: user.id });
  return { data };
});
