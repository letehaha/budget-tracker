import { API_ERROR_CODES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES, type RecordId } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { subYears } from 'date-fns';

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
    details?: Record<string, unknown>;
  };

/** A loan in the user's base currency unless `currencyCode` overrides it. */
const createLoan = ({
  initialBalance,
  currencyCode = global.BASE_CURRENCY_CODE,
}: {
  initialBalance: number;
  currencyCode?: string;
}) =>
  helpers.createLoan({
    payload: helpers.buildCreateLoanPayload({
      initialBalance,
      originalPrincipal: initialBalance,
      currencyCode,
    }),
    raw: true,
  });

/** Creates a plain (not-yet-linked) expense on `accountId`. */
const createExpense = async ({ accountId, amount, time }: { accountId: RecordId; amount: number; time?: string }) => {
  const [tx] = await helpers.createTransaction({
    payload: helpers.buildTransactionPayload({
      accountId,
      amount,
      transactionType: TRANSACTION_TYPES.expense,
      transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
      ...(time ? { time } : {}),
    }),
    raw: true,
  });
  return tx;
};

describe('POST /loans/:id/link-payments', () => {
  it('links existing same-currency expenses as payments and reduces the loan balance', async () => {
    const loan = await createLoan({ initialBalance: 1_000 });
    const source = await helpers.createAccount({ raw: true });
    const first = await createExpense({ accountId: source.id as RecordId, amount: 300 });
    const second = await createExpense({ accountId: source.id as RecordId, amount: 200 });

    const result = await helpers.linkLoanPayments({
      id: loan.id,
      transactionIds: [first.id, second.id],
      raw: true,
    });

    expect(result.linkedCount).toBe(2);

    const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });
    expect(reloaded.currentBalance).toBe(-500);

    // Each linked expense gains its income leg on the loan account: 2 source
    // legs + 2 loan legs.
    const txs = await helpers.getTransactions({ raw: true });
    expect(txs.length).toBe(4);
    const loanLegs = txs.filter((tx) => tx.accountId === loan.id);
    expect(loanLegs.length).toBe(2);
    loanLegs.forEach((leg) => {
      expect(leg.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_loan);
      expect(leg.transactionType).toBe(TRANSACTION_TYPES.income);
    });
  });

  it('rejects an empty selection at the schema level', async () => {
    const loan = await createLoan({ initialBalance: 1_000 });

    const response = await helpers.linkLoanPayments({ id: loan.id, transactionIds: [] });

    expect(response.statusCode).toBe(422);
  });

  it('auto-converts a foreign-currency expense to the loan currency when linking', async () => {
    // Loan in the base currency; payment made from a USD account. The loan-side
    // leg must land in the loan currency, converted from USD.
    const loan = await createLoan({ initialBalance: 1_000_000 });
    const { account: usdAccount } = await helpers.createAccountWithNewCurrency({ currency: 'USD' });
    const expense = await createExpense({ accountId: usdAccount.id as RecordId, amount: 100 });

    const result = await helpers.linkLoanPayments({
      id: loan.id,
      transactionIds: [expense.id],
      raw: true,
    });

    expect(result.linkedCount).toBe(1);

    // The loan-side leg is denominated in the loan's currency, and the balance
    // moved toward zero by the converted amount (not the raw USD figure).
    const txs = await helpers.getTransactions({ raw: true });
    const loanLeg = txs.find((tx) => tx.accountId === loan.id);
    expect(loanLeg?.currencyCode).toBe(global.BASE_CURRENCY_CODE);

    const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });
    expect(reloaded.currentBalance).toBeGreaterThan(-1_000_000);
    expect(reloaded.currentBalance).toBeLessThan(0);
  });

  it('records a pre-anchor payment for history without changing the balance', async () => {
    const loan = await createLoan({ initialBalance: 1_000 });
    const source = await helpers.createAccount({ raw: true });
    // Dated a year before the loan's balance anchor (today): linkable for the
    // record, but already baked into the opening balance so it must not move it.
    const expense = await createExpense({
      accountId: source.id as RecordId,
      amount: 300,
      time: subYears(new Date(), 1).toISOString(),
    });

    const result = await helpers.linkLoanPayments({
      id: loan.id,
      transactionIds: [expense.id],
      raw: true,
    });

    expect(result.linkedCount).toBe(1);

    const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });
    expect(reloaded.currentBalance).toBe(-1_000);

    const txs = await helpers.getTransactions({ raw: true });
    const loanLeg = txs.find((tx) => tx.accountId === loan.id);
    expect(loanLeg).toBeDefined();
    expect(loanLeg?.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_loan);
  });

  describe('overpay handling', () => {
    it('refuses an overpaying batch without confirmation, leaving the loan untouched', async () => {
      const loan = await createLoan({ initialBalance: 1_000 });
      const source = await helpers.createAccount({ raw: true });
      const first = await createExpense({ accountId: source.id as RecordId, amount: 800 });
      const second = await createExpense({ accountId: source.id as RecordId, amount: 700 });

      const response = await helpers.linkLoanPayments({
        id: loan.id,
        transactionIds: [first.id, second.id],
      });

      expect(response.statusCode).toBe(422);
      expect(extractError(response).code).toBe(API_ERROR_CODES.loanPaymentOverpayConfirmationRequired);

      // Whole batch rolled back: nothing linked, balance unchanged.
      const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloaded.currentBalance).toBe(-1_000);
      const txs = await helpers.getTransactions({ raw: true });
      expect(txs.filter((tx) => tx.accountId === loan.id).length).toBe(0);
    });

    it('links an overpaying batch when confirmOverpay is set', async () => {
      const loan = await createLoan({ initialBalance: 1_000 });
      const source = await helpers.createAccount({ raw: true });
      const first = await createExpense({ accountId: source.id as RecordId, amount: 800 });
      const second = await createExpense({ accountId: source.id as RecordId, amount: 700 });

      const result = await helpers.linkLoanPayments({
        id: loan.id,
        transactionIds: [first.id, second.id],
        confirmOverpay: true,
        raw: true,
      });

      expect(result.linkedCount).toBe(2);

      // Loan owed 1,000; 1,500 linked → 500 overpaid (positive balance).
      const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloaded.currentBalance).toBe(500);
    });
  });

  describe('ineligible selections', () => {
    it('rejects linking an income transaction', async () => {
      const loan = await createLoan({ initialBalance: 1_000 });
      const source = await helpers.createAccount({ raw: true });
      const [income] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: source.id as RecordId,
          amount: 300,
          transactionType: TRANSACTION_TYPES.income,
        }),
        raw: true,
      });

      const response = await helpers.linkLoanPayments({ id: loan.id, transactionIds: [income.id] });

      expect(response.statusCode).toBe(422);
      expect(extractError(response).code).toBe(API_ERROR_CODES.validationError);

      const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloaded.currentBalance).toBe(-1_000);
    });

    it('rejects linking a transaction that is already a transfer', async () => {
      const loan = await createLoan({ initialBalance: 1_000 });
      const [sourceA, sourceB] = await Promise.all([
        helpers.createAccount({ raw: true }),
        helpers.createAccount({ raw: true }),
      ]);
      const [transferLeg] = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({ accountId: sourceA.id as RecordId, amount: 300 }),
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          destinationAmount: 300,
          destinationAccountId: sourceB.id as RecordId,
        },
        raw: true,
      });

      const response = await helpers.linkLoanPayments({ id: loan.id, transactionIds: [transferLeg.id] });

      expect(response.statusCode).toBe(422);
      expect(extractError(response).code).toBe(API_ERROR_CODES.validationError);
    });

    it('returns 404 when the target account is not a loan', async () => {
      const regularAccount = await helpers.createAccount({ raw: true });
      const source = await helpers.createAccount({ raw: true });
      const expense = await createExpense({ accountId: source.id as RecordId, amount: 100 });

      const response = await helpers.linkLoanPayments({
        id: regularAccount.id,
        transactionIds: [expense.id],
      });

      expect(response.statusCode).toBe(404);
    });

    it('rejects a batch that contains an already-linked transaction and leaves the unlinked one untouched', async () => {
      const loan = await createLoan({ initialBalance: 1_000 });
      const source = await helpers.createAccount({ raw: true });
      const txA = await createExpense({ accountId: source.id as RecordId, amount: 100 });
      const txB = await createExpense({ accountId: source.id as RecordId, amount: 200 });

      // Link only txA so it becomes transfer_to_loan.
      await helpers.linkLoanPayments({ id: loan.id, transactionIds: [txA.id], raw: true });

      const balanceAfterFirst = (await helpers.getLoanById({ id: loan.id, raw: true })).currentBalance;

      // Attempt to link [txA (already linked), txB] together — txA is ineligible.
      const response = await helpers.linkLoanPayments({ id: loan.id, transactionIds: [txA.id, txB.id] });

      expect(response.statusCode).toBe(422);
      expect(extractError(response).code).toBe(API_ERROR_CODES.validationError);

      // Balance must be exactly the same as after the first (successful) link —
      // txB was NOT linked because the batch rolled back atomically.
      const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloaded.currentBalance).toBe(balanceAfterFirst);

      // txB must still be an ordinary expense on its source account.
      const allTxs = await helpers.getTransactions({ raw: true });
      const txBReloaded = allTxs.find((tx) => tx.id === txB.id);
      expect(txBReloaded?.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
      expect(txBReloaded?.accountId).toBe(source.id);
    });

    it('rejects transaction IDs belonging to another user (security boundary)', async () => {
      const loan = await createLoan({ initialBalance: 1_000 });

      const userBCookies = await createSecondUser();
      const userBExpenseId = await asUser({
        cookies: userBCookies,
        fn: async () => {
          const account = await helpers.createAccount({ raw: true });
          // `buildTransactionPayload` defaults `categoryId` to user A's seeded
          // category; under user B's auth the create endpoint 404s on that foreign
          // category, so use one of user B's own default categories instead.
          const userBCategories = await helpers.getCategoriesList();
          const [expense] = await helpers.createTransaction({
            payload: {
              ...helpers.buildTransactionPayload({
                accountId: account.id as RecordId,
                amount: 300,
                transactionType: TRANSACTION_TYPES.expense,
                transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
              }),
              categoryId: userBCategories[0]!.id,
            },
            raw: true,
          });
          return expense.id;
        },
      });

      // As user A, attempt to link a transaction owned by user B.
      const response = await helpers.linkLoanPayments({ id: loan.id, transactionIds: [userBExpenseId] });

      expect(response.statusCode).toBe(422);
      expect(extractError(response).code).toBe(API_ERROR_CODES.validationError);

      // Loan balance must remain unchanged.
      const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloaded.currentBalance).toBe(-1_000);
    });

    it('rejects a request where the same transaction ID appears more than once', async () => {
      const loan = await createLoan({ initialBalance: 1_000 });
      const source = await helpers.createAccount({ raw: true });
      const txA = await createExpense({ accountId: source.id as RecordId, amount: 200 });

      // Sending the same id twice: Set size (1) !== array length (2).
      const response = await helpers.linkLoanPayments({ id: loan.id, transactionIds: [txA.id, txA.id] });

      expect(response.statusCode).toBe(422);
      expect(extractError(response).code).toBe(API_ERROR_CODES.validationError);

      // txA must remain unlinked and the loan balance unchanged.
      const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloaded.currentBalance).toBe(-1_000);

      const allTxs = await helpers.getTransactions({ raw: true });
      const txAReloaded = allTxs.find((tx) => tx.id === txA.id);
      expect(txAReloaded?.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
    });
  });
});
