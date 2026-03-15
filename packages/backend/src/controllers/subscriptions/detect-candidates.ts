import { createController } from '@controllers/helpers/controller-factory';
import * as subscriptionsService from '@services/subscriptions';
import { z } from 'zod';

const schema = z.object({});

export default createController(schema, async ({ user }) => {
  const result = await subscriptionsService.detectCandidates({
    userId: user.id,
  });

  return { data: result };
});
