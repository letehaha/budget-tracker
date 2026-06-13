import {
  ACCOUNT_CATEGORIES,
  API_ERROR_CODES,
  LOAN_TYPE,
  type RecordId,
  TRANSACTION_TRANSFER_NATURE,
} from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

/**
 * Stands up a loan through the real POST /loans endpoint so the read tests
 * exercise the same creation path (ref-amount calc, transaction wrapping) as
 * production. Cents-based overrides are kept so call sites read in the same
 * unit the projection math uses.
 */
async function createLoanFixture(
  overrides: {
    accountName?: string;
    loanType?: LOAN_TYPE;
    plannedPaymentCents?: number | null;
    lenderName?: string | null;
  } = {},
) {
  const plannedPayment =
    overrides.plannedPaymentCents === undefined
      ? 1_200
      : overrides.plannedPaymentCents === null
        ? null
        : overrides.plannedPaymentCents / 100;

  const account = await helpers.createLoan({
    payload: helpers.buildCreateLoanPayload({
      name: overrides.accountName ?? 'Test mortgage',
      loanType: overrides.loanType ?? LOAN_TYPE.mortgage,
      plannedPayment,
      minPayment: plannedPayment,
      lenderName: overrides.lenderName ?? 'Chase',
    }),
    raw: true,
  });

  return { account };
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
      expect((result.body.response as unknown as { code: string }).code).toBe(API_ERROR_CODES.notFound);
    });

    it('clamps paidToDate to zero when the outstanding balance exceeds the original principal', async () => {
      // Owing more than was borrowed (negative amortization, or a correction
      // that raised the balance) must not render as a negative "paid" amount.
      const created = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({ originalPrincipal: 1_000, initialBalance: 5_000 }),
        raw: true,
      });

      const loan = await helpers.getLoanById({ id: created.id, raw: true });
      expect(loan.projection.paidToDate).toBe(0);
      expect(loan.projection.paidToDatePercent).toBe(0);
    });
  });

  describe('paymentsCount exposure', () => {
    it('is zero for a freshly created loan, on both create and read responses', async () => {
      const created = await helpers.createLoan({ payload: helpers.buildCreateLoanPayload(), raw: true });
      expect(created.paymentsCount).toBe(0);

      const fromGet = await helpers.getLoanById({ id: created.id, raw: true });
      expect(fromGet.paymentsCount).toBe(0);
    });

    it('counts recorded payments on the detail and list responses', async () => {
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({ initialBalance: 5_000, originalPrincipal: 5_000 }),
        raw: true,
      });
      const sourceAccount = await helpers.createAccount({ raw: true });

      await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({ accountId: sourceAccount.id, amount: 500 }),
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
          destinationAmount: 500,
          destinationAccountId: loan.id as RecordId,
        },
        raw: true,
      });

      const fromGet = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(fromGet.paymentsCount).toBe(1);

      const list = await helpers.getLoans({ raw: true });
      expect(list.find((row) => row.id === loan.id)?.paymentsCount).toBe(1);
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

      const fromGet = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(fromGet.loanDetails.lenderName).toBe('Chase');
    });

    it('surfaces the no_planned_payment warning through the API when created without plannedPayment', async () => {
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({ plannedPayment: null, minPayment: null }),
        raw: true,
      });

      expect(loan.loanDetails.plannedPayment).toBeNull();
      expect(loan.projection.warning).toBe('no_planned_payment');
      expect(loan.projection.payoffDate).toBeNull();
      expect(loan.projection.monthsRemaining).toBeNull();
      expect(loan.projection.monthlyInterest).toBeGreaterThan(0);
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
        expect(event.from).toBe(1_200);
        expect(event.to).toBe(1_500);
      }
    });

    it('does not append a rate_change event when interestRate is patched to the same value', async () => {
      const created = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload(),
        raw: true,
      });

      const updated = await helpers.updateLoan({
        id: created.id,
        payload: { interestRate: 6 },
        raw: true,
      });

      expect(updated.loanDetails.interestRate).toBe(6);
      expect(updated.loanDetails.events).toEqual([]);
    });

    it('records a term_change event with `to: null` when the term is cleared', async () => {
      const created = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload(),
        raw: true,
      });

      const updated = await helpers.updateLoan({
        id: created.id,
        payload: { termMonths: null },
        raw: true,
      });

      expect(updated.loanDetails.termMonths).toBeNull();
      const event = updated.loanDetails.events.at(-1);
      expect(event?.type).toBe('term_change');
      if (event?.type === 'term_change') {
        expect(event.from).toBe(360);
        expect(event.to).toBeNull();
      }
    });

    it('applies a manual currentBalance correction and records a balance_correction event', async () => {
      const created = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload(),
        raw: true,
      });

      const updated = await helpers.updateLoan({
        id: created.id,
        payload: { currentBalance: 150_000 },
        raw: true,
      });

      expect(updated.currentBalance).toBe(-150_000);
      const event = updated.loanDetails.events.at(-1);
      expect(event?.type).toBe('balance_correction');
      if (event?.type === 'balance_correction') {
        expect(event.from).toBe(200_000);
        expect(event.to).toBe(150_000);
      }
      expect(updated.projection.paidToDate).toBe(50_000);
    });

    it('treats an echoed unchanged currentBalance as a no-op (no event, no balance churn)', async () => {
      const created = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload(),
        raw: true,
      });

      const updated = await helpers.updateLoan({
        id: created.id,
        payload: { currentBalance: 200_000 },
        raw: true,
      });

      expect(updated.currentBalance).toBe(-200_000);
      expect(updated.loanDetails.events).toEqual([]);
    });

    it('rejects a negative currentBalance', async () => {
      const created = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload(),
        raw: true,
      });

      const result = await helpers.updateLoan({
        id: created.id,
        payload: { currentBalance: -50 },
        raw: false,
      });
      expect(result.statusCode).toBe(422);
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

    it('ignores attempts to change currencyCode on a loan with payments', async () => {
      // Currency change on an Account with denominated transactions would
      // re-interpret every prior amount under the new currency and corrupt
      // history, so loan currency is fixed at creation.
      // updateLoanBodySchema and the PATCH /accounts/:id schema both omit
      // currencyCode, so unknown-key stripping silently drops it. This
      // regression pins that behaviour – if the field is ever added, this
      // test forces a conscious carve-out for loans with payments.
      const created = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({ currencyCode: 'USD' }),
        raw: true,
      });
      const sourceAccount = await helpers.createAccount({ raw: true });
      await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({ accountId: sourceAccount.id, amount: 250 }),
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
          destinationAmount: 250,
          destinationAccountId: created.id as RecordId,
        },
        raw: true,
      });

      const result = await helpers.updateLoan({
        id: created.id,
        payload: { name: 'Renamed loan', currencyCode: 'EUR' } as unknown as Record<string, unknown>,
        raw: true,
      });

      expect(result.currencyCode).toBe('USD');
      expect(result.name).toBe('Renamed loan');
    });
  });

  describe('generic PATCH /accounts/:id is restricted on loan accounts', () => {
    // A loan IS an Account (accountCategory='loan', type='system') carrying a
    // negative-cents liability balance plus a LoanDetails sidecar. The generic
    // account-update endpoint must not be a back door around the dedicated loan
    // path: it may not push the balance (which has its own balance_correction
    // flow on PATCH /loans/:id) nor change accountCategory (which would orphan
    // the LoanDetails sidecar). This mirrors the existing vehicle carve-out.

    it('F2a: rejects a currentBalance change on a loan account through the generic endpoint and leaves the balance untouched', async () => {
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload(),
        raw: true,
      });

      // Positive value also stands in for the "loan pushed into credit" case the
      // dedicated path forbids (it clamps to a non-negative outstanding balance).
      const result = await helpers.updateAccount({
        id: loan.id,
        payload: { currentBalance: 5_000 },
        raw: false,
      });

      expect(result.statusCode).toBe(422);
      expect((result.body.response as unknown as { code: string }).code).toBe(API_ERROR_CODES.validationError);

      // Reload through the loan endpoint: the write must have been blocked, so the
      // ledger still holds the original negative liability balance.
      const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloaded.currentBalance).toBe(-200_000);
    });

    it('F2b: rejects an accountCategory change on a loan account through the generic endpoint and keeps it a loan', async () => {
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload(),
        raw: true,
      });

      const result = await helpers.updateAccount({
        id: loan.id,
        payload: { accountCategory: ACCOUNT_CATEGORIES.general },
        raw: false,
      });

      expect(result.statusCode).toBe(422);
      expect((result.body.response as unknown as { code: string }).code).toBe(API_ERROR_CODES.validationError);

      // Reload: the account is still categorised as a loan, so its LoanDetails
      // sidecar is not orphaned.
      const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloaded.accountCategory).toBe(ACCOUNT_CATEGORIES.loan);
    });

    it('regression: the dedicated PATCH /loans/:id still edits the outstanding balance and records a balance_correction event', async () => {
      // Co-located with the guard tests above: the upcoming generic-endpoint
      // carve-out must NOT break the legitimate loan-balance edit path, which
      // negates to the liability convention and appends a balance_correction.
      const created = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload(),
        raw: true,
      });

      const updated = await helpers.updateLoan({
        id: created.id,
        payload: { currentBalance: 150_000 },
        raw: true,
      });

      expect(updated.currentBalance).toBe(-150_000);
      const event = updated.loanDetails.events.at(-1);
      expect(event?.type).toBe('balance_correction');
      if (event?.type === 'balance_correction') {
        expect(event.from).toBe(200_000);
        expect(event.to).toBe(150_000);
      }
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

    it('rejects deleting a loan that has recorded payments', async () => {
      // Deleting a loan that received payments would silently throw away the
      // expense legs and the principal-paid history. Force the user to clear
      // payments first.
      const created = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload(),
        raw: true,
      });
      const sourceAccount = await helpers.createAccount({ raw: true });

      await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({ accountId: sourceAccount.id, amount: 500 }),
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
          destinationAmount: 500,
          destinationAccountId: created.id as RecordId,
        },
        raw: true,
      });

      const response = await helpers.deleteLoan({ id: created.id, raw: false });
      expect(response.statusCode).toBe(422);
      const errorBody = (response as helpers.CustomResponse<unknown>).body.response as {
        code: string;
        message: string;
      };
      expect(errorBody.code).toBe(API_ERROR_CODES.validationError);
      expect(errorBody.message).toMatch(/payment/i);

      const stillThere = await helpers.getLoanById({ id: created.id, raw: false });
      expect(stillThere.statusCode).toBe(200);
    });

    it('deletes a loan that has timeline events but no payments', async () => {
      // Timeline events (notes, corrections, rate changes) are self-contained
      // metadata that disappears with the loan, so they don't block deletion –
      // only real payment legs do. A user shouldn't be forced to archive over a
      // note they jotted.
      const created = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload(),
        raw: true,
      });

      await helpers.appendLoanNote({
        id: created.id,
        text: 'Refinance window opens Q4',
        raw: true,
      });

      const response = await helpers.deleteLoan({ id: created.id, raw: false });
      expect(response.statusCode).toBe(204);

      const followUp = await helpers.getLoanById({ id: created.id, raw: false });
      expect(followUp.statusCode).toBe(404);
    });

    it('deletes a loan whose only history is a balance correction', async () => {
      // Reproduces the reported flow: a user corrects the outstanding balance
      // (which stamps a balance_correction event) and then wants the loan gone.
      // The correction event must not stand in the way of deletion.
      const created = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload(),
        raw: true,
      });

      const corrected = await helpers.updateLoan({
        id: created.id,
        payload: { currentBalance: 150_000 },
        raw: true,
      });
      expect(corrected.loanDetails.events.at(-1)?.type).toBe('balance_correction');

      const response = await helpers.deleteLoan({ id: created.id, raw: false });
      expect(response.statusCode).toBe(204);

      const followUp = await helpers.getLoanById({ id: created.id, raw: false });
      expect(followUp.statusCode).toBe(404);
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
