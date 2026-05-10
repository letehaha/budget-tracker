import { createController } from '@controllers/helpers/controller-factory';
import { listReceivedInvitations } from '@services/sharing/invitations/list-invitations.service';
import { z } from 'zod';

const schema = z.object({});

export default createController(schema, async ({ user }) => {
  const data = await listReceivedInvitations({ inviteeUserId: user.id });
  return { data };
});
