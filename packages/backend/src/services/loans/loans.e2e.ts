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
});
