import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { getDealMetrics } from '@services/venture/metrics/get-deal-metrics.service';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({ id: recordId() }),
  }),
  async ({ user, params }) => {
    const metrics = await getDealMetrics({ userId: user.id, dealId: params.id });
    return { data: metrics };
  },
);
