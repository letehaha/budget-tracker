import { ACCOUNT_CATEGORIES, API_ERROR_CODES, LOAN_TYPE } from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import LoanDetails from '@models/loan-details.model';
import * as helpers from '@tests/helpers';

/**
 * Slice 2 ships read-only endpoints. Phase 1 has no create endpoint yet, so
 * these tests stand up loans by creating the underlying loan-category Account
 * via the existing helper, then inserting the `LoanDetails` sidecar directly
 * via the model. Once the write endpoints land in Slice 3, the fixture helper
 * here should be replaced with `helpers.createLoan(...)`.
 */
async function createLoanFixture(
  overrides: {
    accountName?: string;
    initialBalanceDecimal?: number;
    loanType?: LOAN_TYPE;
    originalPrincipalCents?: number;
    interestRate?: string;
    plannedPaymentCents?: number | null;
    startDate?: string;
    termMonths?: number | null;
    lenderName?: string | null;
  } = {},
) {
  const initialBalanceDecimal = overrides.initialBalanceDecimal ?? -200_000;

  const account = await helpers.createAccount({
    payload: helpers.buildAccountPayload({
      accountCategory: ACCOUNT_CATEGORIES.loan,
      name: overrides.accountName ?? 'Test mortgage',
      initialBalance: initialBalanceDecimal,
    }),
    raw: true,
  });

  const loanDetails = await LoanDetails.create({
    accountId: account.id,
    userId: account.userId,
    loanType: overrides.loanType ?? LOAN_TYPE.mortgage,
    originalPrincipal: overrides.originalPrincipalCents ?? 20_000_000,
    refOriginalPrincipal: overrides.originalPrincipalCents ?? 20_000_000,
    interestRate: overrides.interestRate ?? '6.0000',
    termMonths: overrides.termMonths ?? 360,
    startDate: overrides.startDate ?? '2020-06-15',
    minPayment: overrides.plannedPaymentCents ?? 120_000,
    refMinPayment: overrides.plannedPaymentCents ?? 120_000,
    plannedPayment: overrides.plannedPaymentCents ?? 120_000,
    refPlannedPayment: overrides.plannedPaymentCents ?? 120_000,
    paymentDayOfMonth: 15,
    lenderName: overrides.lenderName ?? 'Chase',
    accountNumber: '4521',
    events: [],
  });

  return { account, loanDetails };
}

describe('Loans read API', () => {
  describe('GET /loans', () => {
    it('returns an empty array when the user has no loans', async () => {
      const list = await helpers.getLoans({ raw: true });
      expect(list).toEqual([]);
    });

    it('returns every loan owned by the user', async () => {
      await createLoanFixture({ accountName: 'Mortgage A' });
      await createLoanFixture({ accountName: 'Auto loan', loanType: LOAN_TYPE.auto });

      const list = await helpers.getLoans({ raw: true });
      expect(list).toHaveLength(2);
      expect(list.map((row) => row.name).toSorted()).toEqual(['Auto loan', 'Mortgage A']);
    });

    it('serializes each row with flat Account fields plus nested loanDetails and projection', async () => {
      const { account } = await createLoanFixture();

      const list = await helpers.getLoans({ raw: true });
      const row = list[0];
      if (!row) throw new Error('Expected one loan in the list');

      // Top-level id is the underlying Account id — a loan IS an Account.
      expect(row.id).toBe(account.id);
      expect(row.accountCategory).toBe(ACCOUNT_CATEGORIES.loan);
      expect(row.currentBalance).toBe(-200_000);

      expect(row.loanDetails.loanType).toBe(LOAN_TYPE.mortgage);
      expect(row.loanDetails.originalPrincipal).toBe(200_000);
      expect(row.loanDetails.interestRate).toBe(6);
      expect(row.loanDetails.plannedPayment).toBe(1_200);
      expect(row.loanDetails.lenderName).toBe('Chase');
      expect(row.loanDetails.events).toEqual([]);

      expect(row.projection.isPaidOff).toBe(false);
      expect(row.projection.warning).toBeNull();
      expect(row.projection.monthsRemaining).toBe(360);
      expect(row.projection.paidToDate).toBe(0);
    });
  });

  describe('GET /loans/:id', () => {
    it('returns the loan addressed by its underlying Account id', async () => {
      const { account } = await createLoanFixture({ lenderName: 'Wells Fargo' });

      const loan = await helpers.getLoanById({ id: account.id, raw: true });

      expect(loan.id).toBe(account.id);
      expect(loan.loanDetails.lenderName).toBe('Wells Fargo');
      expect(loan.projection).toBeDefined();
      expect(loan.projection.monthlyInterest).toBeGreaterThan(0);
    });

    it('exposes the projection warning when planned payment cannot cover monthly interest', async () => {
      const { account } = await createLoanFixture({ plannedPaymentCents: 10_000 });

      const loan = await helpers.getLoanById({ id: account.id, raw: true });
      expect(loan.projection.warning).toBe('payment_below_interest');
      expect(loan.projection.payoffDate).toBeNull();
    });

    it('responds 404 when no loan exists for the given Account id', async () => {
      const result = await helpers.getLoanById({ id: generateRandomRecordId(), raw: false });
      expect(result.statusCode).toBe(404);
      // On error responses the success-typed body is replaced by an error envelope;
      // cast through unknown to read the `code` discriminator.
      expect((result.body.response as unknown as { code: string }).code).toBe(API_ERROR_CODES.notFound);
    });
  });

  describe('POST /loans', () => {
    it('creates an Account + LoanDetails atomically and returns the projected payoff', async () => {
      const result = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload(),
        raw: false,
      });

      expect(result.statusCode).toBe(201);
      const loan = result.body.response as unknown as Awaited<ReturnType<typeof helpers.createLoan<true>>>;
      expect(loan.id).toEqual(expect.any(String));
      expect(loan.accountCategory).toBe(ACCOUNT_CATEGORIES.loan);
      // Loan balances persist negative for net-worth aggregation; the API exposes the raw signed value.
      expect(loan.currentBalance).toBe(-200_000);
      expect(loan.loanDetails.loanType).toBe(LOAN_TYPE.mortgage);
      expect(loan.loanDetails.originalPrincipal).toBe(200_000);
      expect(loan.loanDetails.interestRate).toBe(6);
      expect(loan.loanDetails.plannedPayment).toBe(1_200);
      expect(loan.loanDetails.events).toEqual([]);
      expect(loan.projection.isPaidOff).toBe(false);
      expect(loan.projection.monthsRemaining).toBeGreaterThan(0);

      // Verify it actually persisted: a follow-up GET returns the same row.
      const fromGet = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(fromGet.loanDetails.lenderName).toBe('Chase');
    });

    it('rejects payload missing required fields', async () => {
      const result = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({ originalPrincipal: undefined }),
        raw: false,
      });
      expect(result.statusCode).toBe(422);
    });

    it('rejects negative interestRate', async () => {
      const result = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({ interestRate: -1 }),
        raw: false,
      });
      expect(result.statusCode).toBe(422);
    });

    it('rejects interestRate >= 100', async () => {
      const result = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({ interestRate: 100 }),
        raw: false,
      });
      expect(result.statusCode).toBe(422);
    });

    it('rejects non-positive originalPrincipal', async () => {
      const result = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({ originalPrincipal: 0 }),
        raw: false,
      });
      expect(result.statusCode).toBe(422);
    });

    it('rejects paymentDayOfMonth outside 1-31', async () => {
      const result = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({ paymentDayOfMonth: 32 }),
        raw: false,
      });
      expect(result.statusCode).toBe(422);
    });
  });

  describe('PATCH /loans/:id', () => {
    it('appends a rate_change event when interestRate changes', async () => {
      const created = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload(),
        raw: true,
      });

      const updated = await helpers.updateLoan({
        id: created.id,
        payload: { interestRate: 7.25 },
        raw: true,
      });

      expect(updated.loanDetails.interestRate).toBe(7.25);
      expect(updated.loanDetails.events).toHaveLength(1);
      const event = updated.loanDetails.events[0];
      expect(event?.type).toBe('rate_change');
      if (event?.type === 'rate_change') {
        expect(event.from).toBe(6);
        expect(event.to).toBe(7.25);
      }
    });

    it('appends a term_change event when termMonths changes', async () => {
      const created = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload(),
        raw: true,
      });

      const updated = await helpers.updateLoan({
        id: created.id,
        payload: { termMonths: 180 },
        raw: true,
      });

      expect(updated.loanDetails.termMonths).toBe(180);
      const event = updated.loanDetails.events.at(-1);
      expect(event?.type).toBe('term_change');
      if (event?.type === 'term_change') {
        expect(event.from).toBe(360);
        expect(event.to).toBe(180);
      }
    });

    it('appends a planned_payment_change event when plannedPayment changes', async () => {
      const created = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload(),
        raw: true,
      });

      const updated = await helpers.updateLoan({
        id: created.id,
        payload: { plannedPayment: 1500 },
        raw: true,
      });

      expect(updated.loanDetails.plannedPayment).toBe(1500);
      const event = updated.loanDetails.events.at(-1);
      expect(event?.type).toBe('planned_payment_change');
      if (event?.type === 'planned_payment_change') {
        expect(event.fromCents).toBe(120_000);
        expect(event.toCents).toBe(150_000);
      }
    });

    it('does not append events for non-timeline-worthy field changes', async () => {
      const created = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload(),
        raw: true,
      });

      const updated = await helpers.updateLoan({
        id: created.id,
        payload: { lenderName: 'Wells Fargo', paymentDayOfMonth: 20 },
        raw: true,
      });

      expect(updated.loanDetails.lenderName).toBe('Wells Fargo');
      expect(updated.loanDetails.paymentDayOfMonth).toBe(20);
      expect(updated.loanDetails.events).toEqual([]);
    });

    it('updates Account.name when name is patched', async () => {
      const created = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload(),
        raw: true,
      });

      const updated = await helpers.updateLoan({
        id: created.id,
        payload: { name: 'Renamed mortgage' },
        raw: true,
      });

      expect(updated.name).toBe('Renamed mortgage');
    });

    it('responds 404 when the loan does not exist', async () => {
      const result = await helpers.updateLoan({
        id: generateRandomRecordId(),
        payload: { interestRate: 5 },
        raw: false,
      });
      expect(result.statusCode).toBe(404);
    });

    it('rejects an empty patch body', async () => {
      const created = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload(),
        raw: true,
      });
      const result = await helpers.updateLoan({
        id: created.id,
        payload: {},
        raw: false,
      });
      expect(result.statusCode).toBe(422);
    });
  });

  describe('DELETE /loans/:id', () => {
    it('removes the loan and its underlying Account row', async () => {
      const created = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload(),
        raw: true,
      });

      const deleteResult = await helpers.deleteLoan({ id: created.id, raw: false });
      expect(deleteResult.statusCode).toBe(204);

      const followUp = await helpers.getLoanById({ id: created.id, raw: false });
      expect(followUp.statusCode).toBe(404);

      const list = await helpers.getLoans({ raw: true });
      expect(list.find((l) => l.id === created.id)).toBeUndefined();
    });

    it('responds 404 when deleting a non-existent loan', async () => {
      const result = await helpers.deleteLoan({ id: generateRandomRecordId(), raw: false });
      expect(result.statusCode).toBe(404);
    });
  });

  describe('POST /loans/:id/events', () => {
    it('appends a note event to the loan timeline', async () => {
      const created = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload(),
        raw: true,
      });

      const updated = await helpers.appendLoanNote({
        id: created.id,
        text: 'Refinance window opens 2026',
        raw: true,
      });

      expect(updated.loanDetails.events).toHaveLength(1);
      const event = updated.loanDetails.events[0];
      expect(event?.type).toBe('note');
      if (event?.type === 'note') {
        expect(event.text).toBe('Refinance window opens 2026');
      }
    });

    it('rejects an empty note', async () => {
      const created = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload(),
        raw: true,
      });

      const result = await helpers.appendLoanNote({ id: created.id, text: '   ', raw: false });
      expect(result.statusCode).toBe(422);
    });

    it('responds 404 when the loan does not exist', async () => {
      const result = await helpers.appendLoanNote({
        id: generateRandomRecordId(),
        text: 'note',
        raw: false,
      });
      expect(result.statusCode).toBe(404);
    });
  });
});
