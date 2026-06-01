import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { unlinkTxFromEvent } from '@services/venture/linking/unlink-tx-from-event.service';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({ id: recordId(), linkId: recordId() }),
  }),
  async ({ user, params }) => {
    const result = await unlinkTxFromEvent({ userId: user.id, eventId: params.id, linkId: params.linkId });
    return { data: result };
  },
);
