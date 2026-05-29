import { booleanQuery, recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { deleteVentureEvent } from '@services/venture/events/delete.service';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({ id: recordId() }),
    query: z
      .object({
        deleteLinkedTransactions: booleanQuery().optional(),
      })
      .optional(),
  }),
  async ({ user, params, query }) => {
    const result = await deleteVentureEvent({
      userId: user.id,
      eventId: params.id,
      deleteLinkedTransactions: query?.deleteLinkedTransactions,
    });
    return { data: result };
  },
);
