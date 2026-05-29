import { VENTURE_DEAL_STATUS, VENTURE_SPV_SUBTYPE } from '@bt/shared/types/venture';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { updateVentureDeal } from '@services/venture/deals/update.service';
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
    params: z.object({ id: recordId() }),
    body: z
      .object({
        name: z.string().trim().min(1).max(255).optional(),
        platformId: recordId().nullable().optional(),
        spvSubtype: z.nativeEnum(VENTURE_SPV_SUBTYPE).nullable().optional(),
        targetCompany: z.string().max(255).nullable().optional(),
        currencyCode: z.string().length(3).optional(),
        status: z.nativeEnum(VENTURE_DEAL_STATUS).optional(),
        principal: decimal().optional(),
        entryFee: decimal().optional(),
        entryFeePct: pct().optional(),
        mgmtFeePct: pct().optional(),
        carryPct: pct().optional(),
        hurdlePct: pct().optional(),
        investmentDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        expectedExitDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
        notes: z.string().max(5000).nullable().optional(),
      })
      .strict()
      .refine((data) => Object.keys(data).length > 0, {
        message: 'At least one field must be provided for update',
      }),
  }),
  async ({ user, params, body }) => {
    const deal = await updateVentureDeal({ userId: user.id, dealId: params.id, ...body });
    return { data: deal };
  },
);
