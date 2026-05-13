import { createController } from '@controllers/helpers/controller-factory';
import { listSentInvitations } from '@services/sharing/invitations/list-invitations.service';
import { z } from 'zod';

const schema = z.object({});

export default createController(schema, async ({ user }) => {
  const data = await listSentInvitations({ ownerUserId: user.id });
  return { data };
});
