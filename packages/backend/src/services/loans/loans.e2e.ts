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
import { addDays, format, subDays } from 'date-fns';

/** Runs `fn` authenticated as the user owning `cookies`, restoring the default test user afterwards. */
async function asUser<T>({ cookies, fn }: { cookies: string; fn: () => Promise<T> }): Promise<T> {
  const original = global.APP_AUTH_COOKIES;
  global.APP_AUTH_COOKIES = cookies;
  try {
    return await fn();
  } finally {
    global.APP_AUTH_COOKIES = original;
  }
}

async function createSecondUser(): Promise<string> {
  const signupRes = await helpers.makeAuthRequest({
    method: 'post',
    url: '/auth/sign-up/email',
    payload: {
      email: `user2-${Date.now()}-${Math.random()}@test.local`,
      password: 'testpassword123',
      name: 'Second User',
    },
  });
  const cookies = helpers.extractCookies(signupRes);
  await asUser({
    cookies,
    fn: () =>
      helpers.makeRequest({
        method: 'post',
        url: '/user/currencies/base',
        payload: { currencyCode: global.BASE_CURRENCY.code },
      }),
  });
  return cookies;
}

/** Creates a loan through POST /loans so tests exercise the real creation path (ref-amount calc, tx wrapping). */
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
      // Near-zero on an untouched loan: the only drift is the gap between the
      // $1,200 planned payment and the ~$1,199.10 scheduled payment.
      expect(row.projection.estimatedInterestPaid).toBeGreaterThanOrEqual(0);
      expect(row.projection.estimatedInterestPaid).toBeLessThan(1_000);
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
      // Mirrors totalInterestRemaining's null: no payoff trajectory, no estimate.
      expect(loan.projection.estimatedInterestPaid).toBeNull();
    });

    it('responds 404 when no loan exists for the given Account id', async () => {
      const result = await helpers.getLoanById({ id: generateRandomRecordId(), raw: false });
      expect(result.statusCode).toBe(404);
      expect((result.body.response as unknown as { code: string }).code).toBe(API_ERROR_CODES.notFound);
    });

    it('clamps paidToDate to zero when the outstanding balance exceeds the original principal', async () => {
      // Outstanding above principal (negative amortization/correction) must not render as a negative "paid" amount.
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

  describe('estimatedInterestPaid exposure', () => {
    // $1,000 loan at 12% APR (1%/mo) with a 3-month term: the scheduled
    // payment is $340.02/mo and the full schedule costs $20.07 in interest
    // (1,000¢ + 670¢ + 337¢) — small enough to hand-verify to the cent.
    const createTermLoan = () =>
      helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({
          currencyCode: global.BASE_CURRENCY_CODE,
          initialBalance: 1_000,
          originalPrincipal: 1_000,
          interestRate: 12,
          termMonths: 3,
        }),
        raw: true,
      });

    const payLoan = async ({ loanId, amount }: { loanId: string; amount: number }) => {
      const sourceAccount = await helpers.createAccount({ raw: true });
      await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({ accountId: sourceAccount.id, amount }),
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
          destinationAmount: amount,
          destinationAccountId: loanId as RecordId,
        },
        raw: true,
      });
    };

    it('is null for a loan created without a term — no schedule exists to estimate from', async () => {
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({ termMonths: null }),
        raw: true,
      });

      expect(loan.projection.estimatedInterestPaid).toBeNull();
      // The forward-looking sibling still projects fine from the planned payment.
      expect(loan.projection.totalInterestRemaining).not.toBeNull();
    });

    it('reflects the scheduled share consumed after a partial payment', async () => {
      const loan = await createTermLoan();
      await payLoan({ loanId: loan.id, amount: 500 });

      const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloaded.currentBalance).toBe(-500);
      // Remaining $500 at the $1,200 planned payment clears in one month
      // costing $5.00 interest; estimate = 20.07 − 5.00.
      expect(reloaded.projection.totalInterestRemaining).toBe(5);
      expect(reloaded.projection.estimatedInterestPaid).toBe(15.07);
    });

    it('reports the full scheduled lifetime interest once the loan is paid off, on both detail and list', async () => {
      const loan = await createTermLoan();
      await payLoan({ loanId: loan.id, amount: 1_000 });

      const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloaded.projection.isPaidOff).toBe(true);
      expect(reloaded.projection.totalInterestRemaining).toBe(0);
      expect(reloaded.projection.estimatedInterestPaid).toBe(20.07);

      const list = await helpers.getLoans({ raw: true });
      expect(list.find((row) => row.id === loan.id)?.projection.estimatedInterestPaid).toBe(20.07);
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

    it('does not mark a loan paid off when outstanding is below principal and the start date is years in the past', async () => {
      // startDate is informational only: the balance anchor is always today, and
      // paid-off is derived solely from the outstanding balance, not elapsed term.
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({
          startDate: '2022-01-10',
          originalPrincipal: 106_000,
          initialBalance: 20_000,
        }),
        raw: true,
      });

      expect(loan.currentBalance).toBe(-20_000);
      expect(loan.projection.isPaidOff).toBe(false);
      expect(loan.projection.paidToDate).toBe(86_000);

      const fromGet = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(fromGet.currentBalance).toBe(-20_000);
      expect(fromGet.projection.isPaidOff).toBe(false);
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
      expect(loan.projection.estimatedInterestPaid).toBeNull();
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

    it.each(['2024-02-30', '2024-13-45'])(
      'rejects a calendar-invalid startDate (%s) with 422 instead of failing at the DATEONLY column',
      async (startDate) => {
        const result = await helpers.createLoan({
          payload: helpers.buildCreateLoanPayload({ startDate }),
          raw: false,
        });
        expect(result.statusCode).toBe(422);
      },
    );

    it('rejects a startDate in the future with 422', async () => {
      const result = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({ startDate: format(addDays(new Date(), 2), 'yyyy-MM-dd') }),
        raw: false,
      });
      expect(result.statusCode).toBe(422);
    });

    it('accepts a startDate of today (boundary)', async () => {
      const result = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({ startDate: format(new Date(), 'yyyy-MM-dd') }),
        raw: false,
      });
      expect(result.statusCode).toBe(201);
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

    it('rejects a calendar-invalid startDate on PATCH with 422', async () => {
      const created = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload(),
        raw: true,
      });
      const result = await helpers.updateLoan({
        id: created.id,
        payload: { startDate: '2024-02-30' },
        raw: false,
      });
      expect(result.statusCode).toBe(422);
    });

    it('rejects patching startDate to a future date with 422', async () => {
      const created = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload(),
        raw: true,
      });
      const result = await helpers.updateLoan({
        id: created.id,
        payload: { startDate: format(addDays(new Date(), 2), 'yyyy-MM-dd') },
        raw: false,
      });
      expect(result.statusCode).toBe(422);
    });

    it('rejects a calendar-invalid currentBalanceAsOf with 422', async () => {
      const created = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload(),
        raw: true,
      });
      const result = await helpers.updateLoan({
        id: created.id,
        payload: { currentBalance: 150_000, currentBalanceAsOf: '2024-02-30' },
        raw: false,
      });
      expect(result.statusCode).toBe(422);
    });

    it('rejects currentBalanceAsOf sent without currentBalance', async () => {
      // The anchor date is a statement "the outstanding was X as-of Y" — a date
      // with no amount has nothing to anchor, so it must be a clean 400-class
      // rejection rather than a 200 that silently drops the payload.
      const created = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload(),
        raw: true,
      });
      const result = await helpers.updateLoan({
        id: created.id,
        payload: { currentBalanceAsOf: format(subDays(new Date(), 5), 'yyyy-MM-dd') },
        raw: false,
      });
      expect(result.statusCode).toBe(422);
    });

    it('re-anchors when the same balance is asserted as-of an earlier date, re-counting later payments', async () => {
      const created = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({
          currencyCode: global.BASE_CURRENCY_CODE,
          initialBalance: 10_000,
          originalPrincipal: 10_000,
        }),
        raw: true,
      });
      const sourceAccount = await helpers.createAccount({ raw: true });

      // Payment dated today (on the creation anchor) — outstanding drops to 8000.
      await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({ accountId: sourceAccount.id, amount: 2_000 }),
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
          destinationAmount: 2_000,
          destinationAccountId: created.id as RecordId,
        },
        raw: true,
      });
      expect((await helpers.getLoanById({ id: created.id, raw: true })).currentBalance).toBe(-8_000);

      // Assert the SAME 8000 outstanding, but as-of yesterday. The amount echoes
      // the current balance, yet the request must not be dropped: the moved
      // anchor makes today's 2000 payment post-anchor again, so it is re-applied
      // on top of the asserted 8000.
      const updated = await helpers.updateLoan({
        id: created.id,
        payload: { currentBalance: 8_000, currentBalanceAsOf: format(subDays(new Date(), 1), 'yyyy-MM-dd') },
        raw: true,
      });

      expect(updated.currentBalance).toBe(-6_000);
      const event = updated.loanDetails.events.at(-1);
      expect(event?.type).toBe('balance_correction');
      if (event?.type === 'balance_correction') {
        expect(event.from).toBe(8_000);
        expect(event.to).toBe(8_000);
      }
    });

    it('ignores attempts to change currencyCode on a loan with payments', async () => {
      // Currency is fixed at loan creation — changing it on an Account with existing
      // transactions would re-interpret every prior amount under the new currency.
      // Both update schemas omit currencyCode, so unknown-key stripping silently drops it.
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
    // A loan IS an Account (accountCategory='loan', type='system') with a
    // LoanDetails sidecar. The generic account-update endpoint must not be a back
    // door around the dedicated loan path for balance or accountCategory changes.

    it('F2a: rejects a currentBalance change on a loan account through the generic endpoint and leaves the balance untouched', async () => {
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload(),
        raw: true,
      });

      // Positive also covers "loan pushed into credit", which the dedicated path
      // forbids by clamping to a non-negative outstanding balance.
      const result = await helpers.updateAccount({
        id: loan.id,
        payload: { currentBalance: 5_000 },
        raw: false,
      });

      expect(result.statusCode).toBe(422);
      expect((result.body.response as unknown as { code: string }).code).toBe(API_ERROR_CODES.validationError);

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

      const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloaded.accountCategory).toBe(ACCOUNT_CATEGORIES.loan);
    });

    it('regression: the dedicated PATCH /loans/:id still edits the outstanding balance and records a balance_correction event', async () => {
      // Confirms the generic-endpoint carve-out above doesn't break the legitimate
      // loan-balance edit path, which negates to the liability convention.
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
      // Deleting a loan with payments would silently throw away the expense legs
      // and principal-paid history, so payments must be cleared first.
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
      // Timeline events are self-contained metadata that disappears with the loan,
      // so only real payment legs block deletion.
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
      // A balance_correction event must not block deletion.
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

  describe('paid_off timeline event', () => {
    /** Base-currency loan owing `initialBalance`, plus a cash account to pay from. */
    const setupLoanWithSource = async ({ initialBalance }: { initialBalance: number }) => {
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({
          currencyCode: global.BASE_CURRENCY_CODE,
          initialBalance,
          originalPrincipal: initialBalance,
        }),
        raw: true,
      });
      const sourceAccount = await helpers.createAccount({ raw: true });
      return { loan, sourceAccount };
    };

    const payLoan = async ({
      loanId,
      sourceAccountId,
      amount,
    }: {
      loanId: string;
      sourceAccountId: RecordId;
      amount: number;
    }) => {
      const [base] = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({ accountId: sourceAccountId, amount }),
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
          destinationAmount: amount,
          destinationAccountId: loanId as RecordId,
        },
        raw: true,
      });
      return base;
    };

    it('appends a single paid_off event when a payment zeroes the outstanding', async () => {
      const { loan, sourceAccount } = await setupLoanWithSource({ initialBalance: 1_000 });

      await payLoan({ loanId: loan.id, sourceAccountId: sourceAccount.id as RecordId, amount: 1_000 });

      const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloaded.currentBalance).toBe(0);
      expect(reloaded.projection.isPaidOff).toBe(true);
      const paidOffEvents = reloaded.loanDetails.events.filter((e) => e.type === 'paid_off');
      expect(paidOffEvents).toHaveLength(1);
      if (paidOffEvents[0]?.type === 'paid_off') {
        expect(typeof paidOffEvents[0].at).toBe('string');
      }
    });

    it('does not duplicate paid_off on reopen, and appends a second one when the loan re-zeroes', async () => {
      const { loan, sourceAccount } = await setupLoanWithSource({ initialBalance: 1_000 });

      const payment = await payLoan({ loanId: loan.id, sourceAccountId: sourceAccount.id as RecordId, amount: 1_000 });
      // Deleting the payoff payment reopens the loan — the balance goes negative
      // again, which must NOT add another paid_off event.
      await helpers.deleteTransaction({ id: payment.id });

      const reopened = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reopened.currentBalance).toBe(-1_000);
      expect(reopened.loanDetails.events.filter((e) => e.type === 'paid_off')).toHaveLength(1);

      // Paying it off again is a fresh negative→zero transition — second event.
      await payLoan({ loanId: loan.id, sourceAccountId: sourceAccount.id as RecordId, amount: 1_000 });

      const repaid = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(repaid.currentBalance).toBe(0);
      expect(repaid.loanDetails.events.filter((e) => e.type === 'paid_off')).toHaveLength(2);
    });

    it('appends paid_off when a manual balance correction zeroes the outstanding', async () => {
      const { loan } = await setupLoanWithSource({ initialBalance: 1_000 });

      const updated = await helpers.updateLoan({
        id: loan.id,
        payload: { currentBalance: 0 },
        raw: true,
      });

      expect(updated.currentBalance).toBe(0);
      const types = updated.loanDetails.events.map((e) => e.type);
      expect(types).toContain('balance_correction');
      expect(types.filter((t) => t === 'paid_off')).toHaveLength(1);
    });
  });

  describe('cross-user isolation', () => {
    it("responds 404 on GET/PATCH/DELETE /loans/:id and POST /loans/:id/events for another user's loan", async () => {
      const userBCookies = await createSecondUser();
      const userBLoanId = await asUser({
        cookies: userBCookies,
        fn: async () => {
          const loan = await helpers.createLoan({
            payload: helpers.buildCreateLoanPayload({ currencyCode: global.BASE_CURRENCY_CODE }),
            raw: true,
          });
          return loan.id;
        },
      });

      // All four id-addressed endpoints must behave exactly as if the loan does
      // not exist — a real foreign id and a random id are indistinguishable.
      const getResult = await helpers.getLoanById({ id: userBLoanId, raw: false });
      expect(getResult.statusCode).toBe(404);

      const patchResult = await helpers.updateLoan({
        id: userBLoanId,
        payload: { interestRate: 1.5 },
        raw: false,
      });
      expect(patchResult.statusCode).toBe(404);

      const deleteResult = await helpers.deleteLoan({ id: userBLoanId, raw: false });
      expect(deleteResult.statusCode).toBe(404);

      const noteResult = await helpers.appendLoanNote({ id: userBLoanId, text: 'intrusion', raw: false });
      expect(noteResult.statusCode).toBe(404);

      // The owner's loan is untouched by all of the rejected calls above.
      const fromOwner = await asUser({
        cookies: userBCookies,
        fn: () => helpers.getLoanById({ id: userBLoanId, raw: true }),
      });
      expect(fromOwner.id).toBe(userBLoanId);
      expect(fromOwner.loanDetails.interestRate).toBe(6);
      expect(fromOwner.loanDetails.events).toEqual([]);
    });
  });
});
