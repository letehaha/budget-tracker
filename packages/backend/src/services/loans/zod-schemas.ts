import { LOAN_TYPE } from '@bt/shared/types';
import { currencyCode, dateString, decimalMoney, recordId } from '@common/lib/zod/custom-types';
import { z } from 'zod';

/**
 * Append-only audit timeline entries persisted on `LoanDetails.events`.
 *
 * The auto-appended event variants (`rate_change`, `term_change`,
 * `planned_payment_change`, `paid_off`, `refinanced`) are not accepted from API
 * input — they're stamped by the services when the underlying fields change.
 * Only `note` is user-authored.
 */
export const loanNoteEventSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

const optionalNullableInt = ({ min, max }: { min: number; max?: number }) => {
  let schema = z.number().int().min(min);
  if (max !== undefined) schema = schema.max(max);
  return schema.nullable().optional();
};

const nonNegativeDecimalMoney = ({ field }: { field: string }) =>
  decimalMoney().refine((m) => !m.isNegative(), { message: `${field} must be >= 0` });

/**
 * Create payload. Spans both the underlying Account (name, currencyCode,
 * initialBalance) and the LoanDetails sidecar. Service composes both rows.
 *
 * `initialBalance` is the outstanding amount at creation time as a positive
 * decimal — the service flips the sign to match the negative-liability
 * accounting convention before writing it to Accounts.currentBalance.
 */
export const createLoanBodySchema = z.object({
  name: z.string().min(1).max(200).trim(),
  currencyCode: currencyCode(),
  initialBalance: nonNegativeDecimalMoney({ field: 'initialBalance' }),

  loanType: z.nativeEnum(LOAN_TYPE),
  originalPrincipal: decimalMoney().refine((m) => m.isPositive(), {
    message: 'originalPrincipal must be > 0',
  }),
  interestRate: z.number().min(0).max(99.9999),
  termMonths: optionalNullableInt({ min: 1, max: 1200 }),
  startDate: dateString(),
  minPayment: nonNegativeDecimalMoney({ field: 'minPayment' }).nullable().optional(),
  plannedPayment: nonNegativeDecimalMoney({ field: 'plannedPayment' }).nullable().optional(),
  paymentDayOfMonth: optionalNullableInt({ min: 1, max: 31 }),
  lenderName: z.string().min(1).max(200).trim().nullable().optional(),
  accountNumber: z.string().min(1).max(100).trim().nullable().optional(),
});

export type CreateLoanBody = z.infer<typeof createLoanBodySchema>;

/**
 * Patch payload. Every field is optional; the service picks up the actual diff
 * against the persisted row and auto-appends events for the three timeline-
 * worthy fields (interestRate / termMonths / plannedPayment).
 *
 * `currencyCode` and `loanType` are intentionally absent: switching currency on
 * an existing account is not supported anywhere in the codebase, and loanType
 * is reference data that doesn't justify a timeline event in Phase 1.
 */
export const updateLoanBodySchema = z
  .object({
    name: z.string().min(1).max(200).trim().optional(),
    // Positive outstanding amount; a negative value would flip into a loan in
    // credit once the service negates it into the ledger convention.
    currentBalance: nonNegativeDecimalMoney({ field: 'currentBalance' }).optional(),

    interestRate: z.number().min(0).max(99.9999).optional(),
    termMonths: optionalNullableInt({ min: 1, max: 1200 }),
    startDate: dateString().optional(),
    minPayment: nonNegativeDecimalMoney({ field: 'minPayment' }).nullable().optional(),
    plannedPayment: nonNegativeDecimalMoney({ field: 'plannedPayment' }).nullable().optional(),
    paymentDayOfMonth: optionalNullableInt({ min: 1, max: 31 }),
    lenderName: z.string().min(1).max(200).trim().nullable().optional(),
    accountNumber: z.string().min(1).max(100).trim().nullable().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });

export type UpdateLoanBody = z.infer<typeof updateLoanBodySchema>;

export const loanIdParamsSchema = z.object({ id: recordId() });
