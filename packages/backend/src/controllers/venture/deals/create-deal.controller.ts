import { VENTURE_CASH_FLOW_MODE, VENTURE_SPV_SUBTYPE, VENTURE_VEHICLE_TYPE } from '@bt/shared/types/venture';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { createVentureDeal } from '@services/venture/deals/create.service';
import { z } from 'zod';

const pct = () =>
  z.coerce
    .number()
    .min(0)
    .max(1)
    .transform((v) => v.toString());

const decimal = () =>
  z.union([z.string(), z.number()]).transform((v) => {
    const s = typeof v === 'number' ? v.toString() : v;
    if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error('Invalid decimal');
    return s;
  });

export default createController(
  z.object({
    body: z.object({
      name: z.string().trim().min(1).max(255),
      currencyCode: z.string().length(3),
      principal: decimal(),
      investmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      platformId: recordId().nullable().optional(),
      vehicleType: z.nativeEnum(VENTURE_VEHICLE_TYPE).optional(),
      spvSubtype: z.nativeEnum(VENTURE_SPV_SUBTYPE).nullable().optional(),
      targetCompany: z.string().max(255).nullable().optional(),
      entryFeePct: pct().optional(),
      entryFee: decimal().optional(),
      mgmtFeePct: pct().optional(),
      carryPct: pct().optional(),
      hurdlePct: pct().optional(),
      expectedExitDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .optional(),
      notes: z.string().max(5000).nullable().optional(),
      initialInvestment: z
        .object({
          cashFlowMode: z.nativeEnum(VENTURE_CASH_FLOW_MODE),
          transactionIds: z.array(recordId()).optional(),
        })
        .optional(),
    }),
  }),
  async ({ user, body }) => {
    const deal = await createVentureDeal({ userId: user.id, ...body });
    return { data: deal };
  },
);
