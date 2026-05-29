import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { replaceEventLinks } from '@services/venture/linking/replace-event-links.service';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({ id: recordId() }),
    body: z.object({
      transactionIds: z.array(recordId()),
    }),
  }),
  async ({ user, params, body }) => {
    const links = await replaceEventLinks({
      userId: user.id,
      eventId: params.id,
      transactionIds: body.transactionIds,
    });
    return { data: links };
  },
);
