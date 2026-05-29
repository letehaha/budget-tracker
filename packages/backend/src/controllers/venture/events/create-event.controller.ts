import { VENTURE_CASH_FLOW_MODE, VENTURE_EVENT_TYPE } from '@bt/shared/types/venture';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { createVentureEvent } from '@services/venture/events/create.service';
import { z } from 'zod';

const decimal = () =>
  z.union([z.string(), z.number()]).transform((v) => {
    const s = typeof v === 'number' ? v.toString() : v;
    if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error('Invalid decimal');
    return s;
  });

export default createController(
  z.object({
    params: z.object({ dealId: recordId() }),
    body: z.object({
      type: z.nativeEnum(VENTURE_EVENT_TYPE),
      eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      grossAmount: decimal().nullable().optional(),
      navAfter: decimal().nullable().optional(),
      quantityPct: z
        .union([z.string(), z.number()])
        .transform((v) => (typeof v === 'number' ? v.toString() : v))
        .nullable()
        .optional(),
      cashFlowMode: z.nativeEnum(VENTURE_CASH_FLOW_MODE),
      transactionIds: z.array(recordId()).optional(),
      lpNetAmountOverride: decimal().nullable().optional(),
      gpCarryOverride: decimal().nullable().optional(),
      notes: z.string().max(5000).nullable().optional(),
    }),
  }),
  async ({ user, params, body }) => {
    const event = await createVentureEvent({
      userId: user.id,
      dealId: params.dealId,
      ...body,
    });
    return { data: event };
  },
);
