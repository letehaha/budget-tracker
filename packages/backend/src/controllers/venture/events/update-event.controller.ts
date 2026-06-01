import { dateString, decimalString, recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeVentureEvent } from '@root/serializers';
import { updateVentureEvent } from '@services/venture/events/update.service';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({ id: recordId() }),
    body: z
      .object({
        eventDate: dateString().optional(),
        grossAmount: decimalString().nullable().optional(),
        navAfter: decimalString().nullable().optional(),
        quantityPct: decimalString().nullable().optional(),
        notes: z.string().max(5000).nullable().optional(),
        gpCarryAmount: decimalString().nullable().optional(),
        lpNetAmount: decimalString().nullable().optional(),
        resetOverrides: z.boolean().optional(),
      })
      .strict()
      .refine((data) => Object.keys(data).length > 0, {
        message: 'At least one field must be provided for update',
      }),
  }),
  async ({ user, params, body }) => {
    const result = await updateVentureEvent({ userId: user.id, eventId: params.id, ...body });
    return { data: { event: serializeVentureEvent(result.event), recomputedEventIds: result.recomputedEventIds } };
  },
);
