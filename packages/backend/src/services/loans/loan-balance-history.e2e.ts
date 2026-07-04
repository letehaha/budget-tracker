import { TRANSACTION_TRANSFER_NATURE, type RecordId } from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { format, subDays } from 'date-fns';

const DAY_30_AGO = format(subDays(new Date(), 30), 'yyyy-MM-dd');
const DAY_20_AGO = format(subDays(new Date(), 20), 'yyyy-MM-dd');
const DAY_10_AGO = format(subDays(new Date(), 10), 'yyyy-MM-dd');
const TODAY = format(new Date(), 'yyyy-MM-dd');

/**
 * Base-currency loan (so refBalance == nominal balance and the Balances rows
 * can be asserted with exact numbers) plus a cash account to pay from.
 */
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

/** Re-anchors `loan` to the same outstanding as-of the given past date. */
const reAnchorLoan = async ({ loanId, balance, asOf }: { loanId: string; balance: number; asOf: string }) =>
  helpers.updateLoan({
    id: loanId,
    payload: { currentBalance: balance, currentBalanceAsOf: asOf },
    raw: true,
  });

/** Pays `amount` into the loan, optionally back-dated. Returns the source expense leg. */
const payLoan = async ({
  loanId,
  sourceAccountId,
  amount,
  time,
}: {
  loanId: string;
  sourceAccountId: RecordId;
  amount: number;
  time?: string;
}) => {
  const [base] = await helpers.createTransaction({
    payload: {
      ...helpers.buildTransactionPayload({ accountId: sourceAccountId, amount, ...(time ? { time } : {}) }),
      transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
      destinationAmount: amount,
      destinationAccountId: loanId as RecordId,
    },
    raw: true,
  });
  return base;
};

/** Fetches the loan's Balances history rows normalized to `{ date, amount }`. */
const getLoanHistory = async ({ loanId }: { loanId: string }) => {
  const rows = await helpers.getBalanceHistory({ accountId: loanId, raw: true });
  return rows.map((row) => ({
    date: format(new Date(row.date), 'yyyy-MM-dd'),
    amount: Number(row.amount),
  }));
};

describe('Loan Balances history rebuild', () => {
  it('rebuilds a stepwise declining history: anchor row plus one cumulative row per payment day', async () => {
    const { loan, sourceAccount } = await setupLoanWithSource({ initialBalance: 10_000 });

    // Anchor the 10000 outstanding 30 days in the past, then record payments
    // 20 and 10 days ago. The history must show the decline at those dates —
    // not a single row stamped today.
    await reAnchorLoan({ loanId: loan.id, balance: 10_000, asOf: DAY_30_AGO });
    await payLoan({
      loanId: loan.id,
      sourceAccountId: sourceAccount.id as RecordId,
      amount: 2_000,
      time: subDays(new Date(), 20).toISOString(),
    });
    await payLoan({
      loanId: loan.id,
      sourceAccountId: sourceAccount.id as RecordId,
      amount: 1_000,
      time: subDays(new Date(), 10).toISOString(),
    });

    const history = await getLoanHistory({ loanId: loan.id });

    // Exactly three rows: the re-anchor rebuild also removes the account-creation
    // row stamped today, since history from the anchor forward is fully
    // determined by the anchor snapshot plus the payment legs.
    expect(history).toEqual([
      { date: DAY_30_AGO, amount: -10_000 },
      { date: DAY_20_AGO, amount: -8_000 },
      { date: DAY_10_AGO, amount: -7_000 },
    ]);

    const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });
    expect(reloaded.currentBalance).toBe(-7_000);
  });

  it('reshapes history when a payment amount is edited', async () => {
    const { loan, sourceAccount } = await setupLoanWithSource({ initialBalance: 10_000 });
    await reAnchorLoan({ loanId: loan.id, balance: 10_000, asOf: DAY_30_AGO });
    const payment = await payLoan({
      loanId: loan.id,
      sourceAccountId: sourceAccount.id as RecordId,
      amount: 2_000,
      time: subDays(new Date(), 20).toISOString(),
    });
    await payLoan({
      loanId: loan.id,
      sourceAccountId: sourceAccount.id as RecordId,
      amount: 1_000,
      time: subDays(new Date(), 10).toISOString(),
    });

    // Bump the 20-days-ago payment from 2000 to 3000 — the whole curve from
    // that day forward must shift down by the extra 1000. Both legs share the
    // loan's currency, so the edit sends `amount` (expense leg) together with
    // `destinationAmount` (loan leg), the way a client edits a same-currency
    // payment: the loan leg's refAmount is derived from the base leg's
    // (calcTransferTransactionRefAmount), so an amount left stale on the base
    // leg would leak the old value into the refAmount-based history rebuild.
    const editResponse = await helpers.updateTransaction({
      id: payment.id,
      payload: { amount: 3_000, destinationAmount: 3_000 },
      raw: false,
    });
    expect(editResponse.statusCode).toBe(200);

    const history = await getLoanHistory({ loanId: loan.id });
    expect(history).toEqual([
      { date: DAY_30_AGO, amount: -10_000 },
      { date: DAY_20_AGO, amount: -7_000 },
      { date: DAY_10_AGO, amount: -6_000 },
    ]);

    const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });
    expect(reloaded.currentBalance).toBe(-6_000);
  });

  it('removes a deleted payment day from history without leaving a ghost row', async () => {
    const { loan, sourceAccount } = await setupLoanWithSource({ initialBalance: 10_000 });
    await reAnchorLoan({ loanId: loan.id, balance: 10_000, asOf: DAY_30_AGO });
    await payLoan({
      loanId: loan.id,
      sourceAccountId: sourceAccount.id as RecordId,
      amount: 2_000,
      time: subDays(new Date(), 20).toISOString(),
    });
    const laterPayment = await payLoan({
      loanId: loan.id,
      sourceAccountId: sourceAccount.id as RecordId,
      amount: 1_000,
      time: subDays(new Date(), 10).toISOString(),
    });

    await helpers.deleteTransaction({ id: laterPayment.id });

    const history = await getLoanHistory({ loanId: loan.id });
    expect(history).toEqual([
      { date: DAY_30_AGO, amount: -10_000 },
      { date: DAY_20_AGO, amount: -8_000 },
    ]);

    const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });
    expect(reloaded.currentBalance).toBe(-8_000);
  });

  it('collapses multiple same-day payments into a single cumulative end-of-day row', async () => {
    // No re-anchor: the loan keeps its creation-day anchor, so the anchor day,
    // the account-creation Balances row, and both payments all share today.
    const { loan, sourceAccount } = await setupLoanWithSource({ initialBalance: 10_000 });

    await payLoan({ loanId: loan.id, sourceAccountId: sourceAccount.id as RecordId, amount: 500 });
    await payLoan({ loanId: loan.id, sourceAccountId: sourceAccount.id as RecordId, amount: 300 });

    const history = await getLoanHistory({ loanId: loan.id });
    expect(history).toEqual([{ date: TODAY, amount: -9_200 }]);
  });
});

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

describe('GET /loans/:id/balance-history (loan-currency series)', () => {
  /**
   * USD loan under the AED test base currency, so base-currency (ref) figures
   * diverge from nominal ones and the endpoint's loan-currency output is
   * distinguishable from the Balances-table history. The source cash account
   * shares the loan's currency so payment legs carry the nominal USD amount.
   */
  const setupNonBaseLoanWithSource = async ({ initialBalance }: { initialBalance: number }) => {
    const { account: sourceAccount } = await helpers.createAccountWithNewCurrency({ currency: 'USD' });
    const loan = await helpers.createLoan({
      payload: helpers.buildCreateLoanPayload({
        currencyCode: 'USD',
        initialBalance,
        originalPrincipal: initialBalance,
      }),
      raw: true,
    });
    return { loan, sourceAccount };
  };

  it('returns nominal loan-currency amounts for a non-base-currency loan', async () => {
    const { loan, sourceAccount } = await setupNonBaseLoanWithSource({ initialBalance: 10_000 });

    await reAnchorLoan({ loanId: loan.id, balance: 10_000, asOf: DAY_30_AGO });
    await payLoan({
      loanId: loan.id,
      sourceAccountId: sourceAccount.id as RecordId,
      amount: 2_000,
      time: subDays(new Date(), 20).toISOString(),
    });
    await payLoan({
      loanId: loan.id,
      sourceAccountId: sourceAccount.id as RecordId,
      amount: 1_000,
      time: subDays(new Date(), 10).toISOString(),
    });

    const history = await helpers.getLoanBalanceHistory({ id: loan.id, raw: true });

    // Nominal USD figures: opening tracked balance minus each nominal payment.
    expect(history).toEqual([
      { date: DAY_30_AGO, amount: -10_000 },
      { date: DAY_20_AGO, amount: -8_000 },
      { date: DAY_10_AGO, amount: -7_000 },
    ]);

    // The Balances-table history stores base-currency (AED) figures — the two
    // series must diverge, proving the endpoint doesn't echo ref conversions.
    const refHistory = await getLoanHistory({ loanId: loan.id });
    expect(refHistory[0]!.amount).not.toBe(-10_000);
  });

  it('folds same-day payments into the anchor row', async () => {
    // No re-anchor: the creation-day anchor and both payments share today, so
    // the series is a single point already reflecting the payments.
    const { loan, sourceAccount } = await setupNonBaseLoanWithSource({ initialBalance: 10_000 });

    await payLoan({ loanId: loan.id, sourceAccountId: sourceAccount.id as RecordId, amount: 500 });
    await payLoan({ loanId: loan.id, sourceAccountId: sourceAccount.id as RecordId, amount: 300 });

    const history = await helpers.getLoanBalanceHistory({ id: loan.id, raw: true });
    expect(history).toEqual([{ date: TODAY, amount: -9_200 }]);
  });

  it('returns a single opening point for a loan with no payments', async () => {
    const { loan } = await setupNonBaseLoanWithSource({ initialBalance: 10_000 });

    const history = await helpers.getLoanBalanceHistory({ id: loan.id, raw: true });

    // Anchor defaults to the creation date, so the opening tracked balance is
    // the only point.
    expect(history).toEqual([{ date: TODAY, amount: -10_000 }]);
  });

  it('returns 404 for a nonexistent loan id', async () => {
    const response = await helpers.getLoanBalanceHistory({ id: generateRandomRecordId() });
    expect(response.statusCode).toBe(404);
  });

  it("returns 404 for another user's loan", async () => {
    const { loan } = await setupNonBaseLoanWithSource({ initialBalance: 10_000 });
    const secondUserCookies = await createSecondUser();

    const response = await asUser({
      cookies: secondUserCookies,
      fn: () => helpers.getLoanBalanceHistory({ id: loan.id }),
    });
    expect(response.statusCode).toBe(404);
  });
});
