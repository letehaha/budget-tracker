import { createController } from '@controllers/helpers/controller-factory';
import { getPlannedSummary } from '@services/transactions/get-planned-summary';
import { z } from 'zod';

const schema = z.object({});

export default createController(schema, async ({ user }) => {
  const data = await getPlannedSummary({ userId: user.id });

  return { data };
});
