import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { markPeriodPaid } from '@services/payment-reminders/mark-period-paid';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
    periodId: recordId(),
  }),
  body: z
    .object({
      transactionId: recordId().nullable().optional(),
      notes: z.string().max(5000).nullable().optional(),
      // Create the expense transaction from the reminder instead of linking an
      // existing one. Mutually exclusive with `transactionId`.
      createTransaction: z.boolean().optional(),
      // Decimal amount override for the created transaction. Falls back to the
      // reminder's expectedAmount when omitted.
      amount: z.number().positive().optional(),
      // Actual payment date for the created transaction (can be before the due
      // date). Falls back to now when omitted.
      time: z.coerce.date().optional(),
    })
    .optional()
    // Create-mode and link-mode can't be combined: the user either links an
    // existing transaction or creates a new one, never both.
    .refine((b) => !(b?.createTransaction && b?.transactionId != null), {
      message: 'createTransaction and transactionId cannot be used together',
      path: ['transactionId'],
    }),
});

export default createController(schema, async ({ user, params, body }) => {
  const period = await markPeriodPaid({
    userId: user.id,
    reminderId: params.id,
    periodId: params.periodId,
    transactionId: body?.transactionId,
    notes: body?.notes,
    createTransaction: body?.createTransaction,
    amount: body?.amount,
    time: body?.time,
  });

  return { data: period };
});
