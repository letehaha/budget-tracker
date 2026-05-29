import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { listVentureEvents } from '@services/venture/events/list.service';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({ dealId: recordId() }),
  }),
  async ({ user, params }) => {
    const events = await listVentureEvents({ userId: user.id, dealId: params.dealId });
    return { data: events };
  },
);
