import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { updateVentureEvent } from '@services/venture/events/update.service';
import { z } from 'zod';

const decimal = () =>
  z.union([z.string(), z.number()]).transform((v) => {
    const s = typeof v === 'number' ? v.toString() : v;
    if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error('Invalid decimal');
    return s;
  });

export default createController(
  z.object({
    params: z.object({ id: recordId() }),
    body: z
      .object({
        eventDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        grossAmount: decimal().nullable().optional(),
        navAfter: decimal().nullable().optional(),
        quantityPct: z
          .union([z.string(), z.number()])
          .transform((v) => (typeof v === 'number' ? v.toString() : v))
          .nullable()
          .optional(),
        notes: z.string().max(5000).nullable().optional(),
        gpCarryAmount: decimal().nullable().optional(),
        lpNetAmount: decimal().nullable().optional(),
        resetOverrides: z.boolean().optional(),
      })
      .strict()
      .refine((data) => Object.keys(data).length > 0, {
        message: 'At least one field must be provided for update',
      }),
  }),
  async ({ user, params, body }) => {
    const result = await updateVentureEvent({ userId: user.id, eventId: params.id, ...body });
    return { data: result };
  },
);
