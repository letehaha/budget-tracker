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

/** Sets up a loan with one expense already linked as a payment. */
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

    // Each linked expense gains an income leg on the loan account: 2 source + 2 loan legs.
    const txs = await helpers.getTransactions({ raw: true });
    expect(txs.length).toBe(4);
    const loanLegs = txs.filter((tx) => tx.accountId === loan.id);
    expect(loanLegs.length).toBe(2);
    loanLegs.forEach((leg) => {
      expect(leg.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_loan);
      expect(leg.transactionType).toBe(TRANSACTION_TYPES.income);
    });
  });

  it('auto-converts a foreign-currency expense to the loan currency when linking', async () => {
    // Loan in base currency, payment from a USD account: the loan-side leg must
    // land in the loan currency, converted from USD.
    const loan = await createLoan({ initialBalance: 1_000_000 });
    const { account: usdAccount } = await helpers.createAccountWithNewCurrency({ currency: 'USD' });
    const expense = await createExpense({ accountId: usdAccount.id as RecordId, amount: 100 });

    const result = await helpers.linkLoanPayments({
      id: loan.id,
      transactionIds: [expense.id],
      raw: true,
    });

    expect(result.linkedCount).toBe(1);

    // Balance moved by the converted amount, not the raw USD figure.
    const txs = await helpers.getTransactions({ raw: true });
    const loanLeg = txs.find((tx) => tx.accountId === loan.id);
    expect(loanLeg?.currencyCode).toBe(global.BASE_CURRENCY_CODE);

    const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });
    expect(reloaded.currentBalance).toBeGreaterThan(-1_000_000);
    expect(reloaded.currentBalance).toBeLessThan(0);
  });

  it('links a mixed batch but only counts the post-anchor expenses toward the balance', async () => {
    const loan = await createLoan({ initialBalance: 1_000 });
    const source = await helpers.createAccount({ raw: true });

    // Dated before the anchor (today): links for the record, already baked into
    // the opening balance, so it must not move it.
    const preAnchor = await createExpense({
      accountId: source.id as RecordId,
      amount: 200,
      time: subYears(new Date(), 1).toISOString(),
    });
    // Default time is today (>= anchor): counts toward the balance.
    const postAnchor = await createExpense({ accountId: source.id as RecordId, amount: 300 });

    const result = await helpers.linkLoanPayments({
      id: loan.id,
      transactionIds: [preAnchor.id, postAnchor.id],
      raw: true,
    });

    // Both link (both are eligible), but only the 300 post-anchor payment moves
    // the balance: -1,000 + 300 = -700. The pre-anchor 200 is history only.
    expect(result.linkedCount).toBe(2);

    const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });
    expect(reloaded.currentBalance).toBe(-700);

    // Each linked expense still gains its loan-account income leg, pre-anchor included.
    const txs = await helpers.getTransactions({ raw: true });
    const loanLegs = txs.filter((tx) => tx.accountId === loan.id);
    expect(loanLegs.length).toBe(2);
    loanLegs.forEach((leg) => {
      expect(leg.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_loan);
    });
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

    it('caps an overpaying batch at zero and marks the loan paid off, never crediting the excess', async () => {
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

      const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });

      // Loan owed 1,000; 1,500 linked. The outstanding balance floors at zero —
      // the 500 excess is never credited back to the loan.
      expect(reloaded.currentBalance).toBe(0);

      // The owing → settled transition stamps exactly one paid_off event.
      const paidOffEvents = reloaded.loanDetails.events.filter((e) => e.type === 'paid_off');
      expect(paidOffEvents).toHaveLength(1);

      // Reads report a settled loan with no phantom credit (never over 100% paid).
      expect(reloaded.projection.isPaidOff).toBe(true);
      expect(reloaded.projection.paidToDatePercent).toBe(100);

      // The excess stays on the cash-account expense legs: both link as payments.
      const txs = await helpers.getTransactions({ raw: true });
      const loanLegs = txs.filter((tx) => tx.accountId === loan.id);
      expect(loanLegs.length).toBe(2);
    });
  });

  describe('ineligible selections', () => {
    it('rejects an empty selection and a duplicated transaction ID at the schema level', async () => {
      const loan = await createLoan({ initialBalance: 1_000 });
      const source = await helpers.createAccount({ raw: true });
      const txA = await createExpense({ accountId: source.id as RecordId, amount: 200 });

      const emptyResponse = await helpers.linkLoanPayments({ id: loan.id, transactionIds: [] });
      expect(emptyResponse.statusCode).toBe(422);

      // Sending the same id twice: Set size (1) !== array length (2).
      const duplicateResponse = await helpers.linkLoanPayments({ id: loan.id, transactionIds: [txA.id, txA.id] });
      expect(duplicateResponse.statusCode).toBe(422);
      expect(extractError(duplicateResponse).code).toBe(API_ERROR_CODES.validationError);

      const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloaded.currentBalance).toBe(-1_000);

      const allTxs = await helpers.getTransactions({ raw: true });
      const txAReloaded = allTxs.find((tx) => tx.id === txA.id);
      expect(txAReloaded?.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
    });

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

      await helpers.linkLoanPayments({ id: loan.id, transactionIds: [txA.id], raw: true });

      const balanceAfterFirst = (await helpers.getLoanById({ id: loan.id, raw: true })).currentBalance;

      // txA is already linked, so including it again makes the batch ineligible.
      const response = await helpers.linkLoanPayments({ id: loan.id, transactionIds: [txA.id, txB.id] });

      expect(response.statusCode).toBe(422);
      expect(extractError(response).code).toBe(API_ERROR_CODES.validationError);

      // txB was NOT linked — the batch rolled back atomically.
      const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloaded.currentBalance).toBe(balanceAfterFirst);

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
          // `buildTransactionPayload` defaults categoryId to user A's seeded category,
          // which 404s under user B's auth, so use one of user B's own categories.
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

      // Back on user A's auth: attempt to link a transaction owned by user B.
      const response = await helpers.linkLoanPayments({ id: loan.id, transactionIds: [userBExpenseId] });

      expect(response.statusCode).toBe(422);
      expect(extractError(response).code).toBe(API_ERROR_CODES.validationError);

      const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloaded.currentBalance).toBe(-1_000);
    });
  });
});

describe('POST /loans/:id/unlink-payment', () => {
  it('deletes the loan leg, restores the source expense, and recomputes the balance', async () => {
    const { loan, source, expense } = await linkOnePayment({ initialBalance: 1_000, amount: 300 });

    // Linking moved the balance to -700; confirm the precondition before unlinking.
    expect((await helpers.getLoanById({ id: loan.id, raw: true })).currentBalance).toBe(-700);

    const result = await helpers.unlinkLoanPayment({ id: loan.id, transactionId: expense.id, raw: true });

    expect(result.restoredTransactionId).toBe(expense.id);
    // Payment no longer counts, so the balance returns to the original owed amount.
    expect(result.loan.currentBalance).toBe(-1_000);
    expect((await helpers.getLoanById({ id: loan.id, raw: true })).currentBalance).toBe(-1_000);

    const txs = await helpers.getTransactions({ raw: true });
    expect(txs.filter((tx) => tx.accountId === loan.id).length).toBe(0);
    const restored = txs.find((tx) => tx.id === expense.id);
    expect(restored?.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
    expect(restored?.transferId).toBeNull();
    expect(restored?.transactionType).toBe(TRANSACTION_TYPES.expense);
    expect(restored?.accountId).toBe(source.id);

    // The restored expense is eligible again — re-linking reproduces the payment.
    const relink = await helpers.linkLoanPayments({ id: loan.id, transactionIds: [expense.id], raw: true });
    expect(relink.linkedCount).toBe(1);
    expect((await helpers.getLoanById({ id: loan.id, raw: true })).currentBalance).toBe(-700);
  });

  it('accepts the loan-side leg id and still restores the source expense', async () => {
    const { loan, expense, loanLegId } = await linkOnePayment({ initialBalance: 1_000, amount: 300 });

    // Either leg id resolves to the same unlink — the service splits the pair by account.
    const result = await helpers.unlinkLoanPayment({ id: loan.id, transactionId: loanLegId, raw: true });

    expect(result.restoredTransactionId).toBe(expense.id);
    expect(result.loan.currentBalance).toBe(-1_000);

    const txs = await helpers.getTransactions({ raw: true });
    expect(txs.filter((tx) => tx.accountId === loan.id).length).toBe(0);
    expect(txs.find((tx) => tx.id === expense.id)?.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
  });

  it('unlinks a pre-anchor payment, leaving the balance unchanged before and after', async () => {
    const loan = await createLoan({ initialBalance: 1_000 });
    const source = await helpers.createAccount({ raw: true });
    // Dated a year before the anchor (today) — informational only, already
    // baked into the opening balance.
    const expense = await createExpense({
      accountId: source.id as RecordId,
      amount: 300,
      time: subYears(new Date(), 1).toISOString(),
    });

    await helpers.linkLoanPayments({ id: loan.id, transactionIds: [expense.id], raw: true });

    // Linking a pre-anchor payment must not move the balance.
    expect((await helpers.getLoanById({ id: loan.id, raw: true })).currentBalance).toBe(-1_000);

    const result = await helpers.unlinkLoanPayment({ id: loan.id, transactionId: expense.id, raw: true });

    // There was nothing counted against the balance, so unlinking is also a no-op.
    expect(result.loan.currentBalance).toBe(-1_000);
    expect((await helpers.getLoanById({ id: loan.id, raw: true })).currentBalance).toBe(-1_000);

    const txs = await helpers.getTransactions({ raw: true });
    expect(txs.filter((tx) => tx.accountId === loan.id).length).toBe(0);
    const restored = txs.find((tx) => tx.id === expense.id);
    expect(restored?.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
    expect(restored?.transferId).toBeNull();
    expect(restored?.transactionType).toBe(TRANSACTION_TYPES.expense);
    expect(restored?.accountId).toBe(source.id);
  });

  it('unlinks a cross-currency payment, fully restoring the loan balance and the source expense', async () => {
    const loan = await createLoan({ initialBalance: 1_000_000 });
    const { account: usdAccount } = await helpers.createAccountWithNewCurrency({ currency: 'USD' });
    // Post-anchor (today) so the converted amount actually reduces the balance.
    const expense = await createExpense({ accountId: usdAccount.id as RecordId, amount: 100 });

    await helpers.linkLoanPayments({ id: loan.id, transactionIds: [expense.id], raw: true });

    const afterLink = await helpers.getLoanById({ id: loan.id, raw: true });
    // The converted payment moved the balance toward zero.
    expect(afterLink.currentBalance).toBeGreaterThan(-1_000_000);
    expect(afterLink.currentBalance).toBeLessThan(0);

    const result = await helpers.unlinkLoanPayment({ id: loan.id, transactionId: expense.id, raw: true });

    // Unlinking restores exactly the converted amount that was subtracted.
    expect(result.loan.currentBalance).toBe(-1_000_000);
    expect((await helpers.getLoanById({ id: loan.id, raw: true })).currentBalance).toBe(-1_000_000);

    const txs = await helpers.getTransactions({ raw: true });
    expect(txs.filter((tx) => tx.accountId === loan.id).length).toBe(0);
    // The source expense survives as an ordinary expense in its own currency.
    const restored = txs.find((tx) => tx.id === expense.id);
    expect(restored?.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
    expect(restored?.transferId).toBeNull();
    expect(restored?.transactionType).toBe(TRANSACTION_TYPES.expense);
    expect(restored?.accountId).toBe(usdAccount.id);
    expect(restored?.currencyCode).toBe('USD');
  });

  it('unlinks one of several linked payments, leaving the others linked and reflected in the balance', async () => {
    const loan = await createLoan({ initialBalance: 1_000 });
    const source = await helpers.createAccount({ raw: true });
    const first = await createExpense({ accountId: source.id as RecordId, amount: 100 });
    const second = await createExpense({ accountId: source.id as RecordId, amount: 200 });
    const third = await createExpense({ accountId: source.id as RecordId, amount: 300 });

    await helpers.linkLoanPayments({
      id: loan.id,
      transactionIds: [first.id, second.id, third.id],
      raw: true,
    });

    // All three post-anchor payments reduced the balance: 1000 - 100 - 200 - 300 = 400.
    expect((await helpers.getLoanById({ id: loan.id, raw: true })).currentBalance).toBe(-400);

    const result = await helpers.unlinkLoanPayment({ id: loan.id, transactionId: second.id, raw: true });

    // Only the 200 payment is removed: 1000 - 100 - 300 = 600.
    expect(result.loan.currentBalance).toBe(-600);
    expect((await helpers.getLoanById({ id: loan.id, raw: true })).currentBalance).toBe(-600);

    const txs = await helpers.getTransactions({ raw: true });

    // The unlinked payment is restored to a plain expense.
    const restoredSecond = txs.find((tx) => tx.id === second.id);
    expect(restoredSecond?.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
    expect(restoredSecond?.transferId).toBeNull();

    // The other two pairs remain intact — still linked as loan payments.
    const restoredFirst = txs.find((tx) => tx.id === first.id);
    const restoredThird = txs.find((tx) => tx.id === third.id);
    expect(restoredFirst?.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_loan);
    expect(restoredFirst?.transferId).not.toBeNull();
    expect(restoredThird?.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_loan);
    expect(restoredThird?.transferId).not.toBeNull();

    // Exactly two loan-side income legs remain (for the first and third payments).
    const loanLegs = txs.filter((tx) => tx.accountId === loan.id);
    expect(loanLegs.length).toBe(2);
  });

  describe('invalid requests', () => {
    it('rejects an empty body at the schema level and a plain expense that is not a loan payment', async () => {
      const loan = await createLoan({ initialBalance: 1_000 });
      const source = await helpers.createAccount({ raw: true });
      const expense = await createExpense({ accountId: source.id as RecordId, amount: 300 });

      const emptyResponse = await helpers.unlinkLoanPayment({ id: loan.id, transactionId: '' });
      expect(emptyResponse.statusCode).toBe(422);

      const response = await helpers.unlinkLoanPayment({ id: loan.id, transactionId: expense.id });

      expect(response.statusCode).toBe(422);
      expect(extractError(response).code).toBe(API_ERROR_CODES.validationError);

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
