import { createController } from '@controllers/helpers/controller-factory';
import { listSharedWithMe } from '@services/sharing/members/list-shared-with-me.service';
import { z } from 'zod';

const schema = z.object({});

export default createController(schema, async ({ user }) => {
  const data = await listSharedWithMe({ userId: user.id });
  return { data };
});
