import { API_ERROR_CODES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES, type RecordId } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

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

/** Reads the error envelope (`code` + `message`) from a failed helper response. */
const extractError = (response: unknown) =>
  (response as helpers.CustomResponse<unknown>).body.response as unknown as {
    code: string;
    message: string;
  };

/** A loan in the user's base currency. */
const createLoan = ({ initialBalance }: { initialBalance: number }) =>
  helpers.createLoan({
    payload: helpers.buildCreateLoanPayload({
      initialBalance,
      originalPrincipal: initialBalance,
      currencyCode: global.BASE_CURRENCY_CODE,
    }),
    raw: true,
  });

/** Creates a plain (not-yet-linked) expense on `accountId`. */
const createExpense = async ({ accountId, amount }: { accountId: RecordId; amount: number }) => {
  const [tx] = await helpers.createTransaction({
    payload: helpers.buildTransactionPayload({
      accountId,
      amount,
      transactionType: TRANSACTION_TYPES.expense,
      transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
    }),
    raw: true,
  });
  return tx;
};

/**
 * Sets up a loan with one expense already linked as a payment. Returns the loan,
 * the source account/expense (now the source leg) and the loan-side income leg id.
 */
const linkOnePayment = async ({
  initialBalance = 1_000,
  amount = 300,
}: { initialBalance?: number; amount?: number } = {}) => {
  const loan = await createLoan({ initialBalance });
  const source = await helpers.createAccount({ raw: true });
  const expense = await createExpense({ accountId: source.id as RecordId, amount });

  await helpers.linkLoanPayments({ id: loan.id, transactionIds: [expense.id], raw: true });

  const txs = await helpers.getTransactions({ raw: true });
  const loanLeg = txs.find((tx) => tx.accountId === loan.id)!;

  return { loan, source, expense, loanLegId: loanLeg.id };
};

describe('POST /loans/:id/unlink-payment', () => {
  it('deletes the loan leg, restores the source expense, and recomputes the balance', async () => {
    const { loan, source, expense } = await linkOnePayment({ initialBalance: 1_000, amount: 300 });

    // Linking moved the balance to -700; confirm the precondition before unlinking.
    expect((await helpers.getLoanById({ id: loan.id, raw: true })).currentBalance).toBe(-700);

    const result = await helpers.unlinkLoanPayment({ id: loan.id, transactionId: expense.id, raw: true });

    expect(result.restoredTransactionId).toBe(expense.id);
    // Balance returns to the original owed amount — the payment no longer counts.
    expect(result.loan.currentBalance).toBe(-1_000);
    expect((await helpers.getLoanById({ id: loan.id, raw: true })).currentBalance).toBe(-1_000);

    const txs = await helpers.getTransactions({ raw: true });
    // The loan-side income leg is gone.
    expect(txs.filter((tx) => tx.accountId === loan.id).length).toBe(0);
    // The source expense survives as an ordinary expense on its own account.
    const restored = txs.find((tx) => tx.id === expense.id);
    expect(restored?.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
    expect(restored?.transferId).toBeNull();
    expect(restored?.transactionType).toBe(TRANSACTION_TYPES.expense);
    expect(restored?.accountId).toBe(source.id);
  });

  it('accepts the loan-side leg id and still restores the source expense', async () => {
    const { loan, expense, loanLegId } = await linkOnePayment({ initialBalance: 1_000, amount: 300 });

    // Pass the loan-side income leg rather than the source expense — the service
    // splits the pair by account, so either leg id resolves to the same unlink.
    const result = await helpers.unlinkLoanPayment({ id: loan.id, transactionId: loanLegId, raw: true });

    expect(result.restoredTransactionId).toBe(expense.id);
    expect(result.loan.currentBalance).toBe(-1_000);

    const txs = await helpers.getTransactions({ raw: true });
    expect(txs.filter((tx) => tx.accountId === loan.id).length).toBe(0);
    expect(txs.find((tx) => tx.id === expense.id)?.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
  });

  it('allows re-linking an expense after it was unlinked', async () => {
    const { loan, expense } = await linkOnePayment({ initialBalance: 1_000, amount: 300 });

    await helpers.unlinkLoanPayment({ id: loan.id, transactionId: expense.id, raw: true });

    // The restored expense is eligible again — re-linking reproduces the payment.
    const relink = await helpers.linkLoanPayments({ id: loan.id, transactionIds: [expense.id], raw: true });
    expect(relink.linkedCount).toBe(1);
    expect((await helpers.getLoanById({ id: loan.id, raw: true })).currentBalance).toBe(-700);
  });

  describe('invalid requests', () => {
    it('rejects an empty body at the schema level', async () => {
      const loan = await createLoan({ initialBalance: 1_000 });

      const response = await helpers.unlinkLoanPayment({ id: loan.id, transactionId: '' });

      expect(response.statusCode).toBe(422);
    });

    it('rejects unlinking a plain expense that is not a loan payment', async () => {
      const loan = await createLoan({ initialBalance: 1_000 });
      const source = await helpers.createAccount({ raw: true });
      const expense = await createExpense({ accountId: source.id as RecordId, amount: 300 });

      const response = await helpers.unlinkLoanPayment({ id: loan.id, transactionId: expense.id });

      expect(response.statusCode).toBe(422);
      expect(extractError(response).code).toBe(API_ERROR_CODES.validationError);

      // The expense is untouched and the loan balance is unchanged.
      const txs = await helpers.getTransactions({ raw: true });
      expect(txs.find((tx) => tx.id === expense.id)?.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
      expect((await helpers.getLoanById({ id: loan.id, raw: true })).currentBalance).toBe(-1_000);
    });

    it('returns 404 when the target account is not a loan', async () => {
      const { expense } = await linkOnePayment({ initialBalance: 1_000, amount: 300 });
      const regularAccount = await helpers.createAccount({ raw: true });

      const response = await helpers.unlinkLoanPayment({ id: regularAccount.id, transactionId: expense.id });

      expect(response.statusCode).toBe(404);
    });

    it('returns 404 when another user tries to unlink the payment', async () => {
      const { loan, expense } = await linkOnePayment({ initialBalance: 1_000, amount: 300 });

      const userBCookies = await createSecondUser();
      const response = await asUser({
        cookies: userBCookies,
        fn: () => helpers.unlinkLoanPayment({ id: loan.id, transactionId: expense.id }),
      });

      expect(response.statusCode).toBe(404);

      // The payment is still linked on the owner's loan.
      expect((await helpers.getLoanById({ id: loan.id, raw: true })).currentBalance).toBe(-700);
    });

    it('rejects unlinking against a different loan than the payment belongs to', async () => {
      const { loan, expense } = await linkOnePayment({ initialBalance: 1_000, amount: 300 });
      const otherLoan = await createLoan({ initialBalance: 5_000 });

      // The payment's loan-side leg lives on `loan`, not `otherLoan`.
      const response = await helpers.unlinkLoanPayment({ id: otherLoan.id, transactionId: expense.id });

      expect(response.statusCode).toBe(422);
      expect(extractError(response).code).toBe(API_ERROR_CODES.validationError);

      // Both loans untouched; the payment stays linked to its real loan.
      expect((await helpers.getLoanById({ id: loan.id, raw: true })).currentBalance).toBe(-700);
      expect((await helpers.getLoanById({ id: otherLoan.id, raw: true })).currentBalance).toBe(-5_000);
    });
  });
});
