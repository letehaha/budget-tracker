import { API_ERROR_CODES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES, type RecordId } from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

/** Reads the error envelope (`code` + `message`) from a failed helper response. */
const extractError = (response: unknown) =>
  (response as helpers.CustomResponse<unknown>).body.response as unknown as {
    code: string;
    message: string;
  };

/** Creates a loan + source account and pays `amount` from source into the loan. */
const setupLoanPaymentPair = async ({ initialBalance, amount }: { initialBalance: number; amount: number }) => {
  const loan = await helpers.createLoan({
    payload: helpers.buildCreateLoanPayload({
      initialBalance,
      originalPrincipal: initialBalance,
    }),
    raw: true,
  });
  const sourceAccount = await helpers.createAccount({ raw: true });

  const [base, opposite] = await helpers.createTransaction({
    payload: {
      ...helpers.buildTransactionPayload({
        accountId: sourceAccount.id,
        amount,
      }),
      transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
      destinationAmount: amount,
      destinationAccountId: loan.id as RecordId,
    },
    raw: true,
  });

  const expenseLeg = base.accountId === sourceAccount.id ? base : opposite!;

  return { loan, sourceAccount, base, opposite: opposite!, expenseLeg };
};

describe('Loan payment integration', () => {
  describe('POST /transactions with transferNature=transfer_to_loan', () => {
    it('creates a paired transfer, stamps both legs with transfer_to_loan, and reduces the loan balance', async () => {
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({
          initialBalance: 2_500,
          originalPrincipal: 2_500,
        }),
        raw: true,
      });

      const sourceAccount = await helpers.createAccount({ raw: true });

      const [base, opposite] = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: sourceAccount.id,
            amount: 500,
          }),
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
          destinationAmount: 500,
          destinationAccountId: loan.id as RecordId,
        },
        raw: true,
      });

      expect(base.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_loan);
      expect(opposite!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_loan);
      expect(base.transferId).toBeTruthy();
      expect(opposite!.transferId).toBe(base.transferId);

      const loanLeg = base.accountId === loan.id ? base : opposite!;
      const sourceLeg = base.accountId === sourceAccount.id ? base : opposite!;
      expect(loanLeg.accountId).toBe(loan.id);
      expect(loanLeg.transactionType).toBe(TRANSACTION_TYPES.income);
      expect(sourceLeg.accountId).toBe(sourceAccount.id);
      expect(sourceLeg.transactionType).toBe(TRANSACTION_TYPES.expense);

      const reloadedLoan = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloadedLoan.currentBalance).toBe(-2_000);
    });

    it('rejects a transfer_to_loan transfer whose destination is not a loan-category account', async () => {
      const [sourceAccount, regularDestination] = await Promise.all([
        helpers.createAccount({ raw: true }),
        helpers.createAccount({ raw: true }),
      ]);

      const response = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: sourceAccount.id,
            amount: 500,
          }),
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
          destinationAmount: 500,
          destinationAccountId: regularDestination.id,
        },
      });

      expect(response.statusCode).toBe(422);
      const errorBody = extractError(response);
      expect(errorBody.code).toBe(API_ERROR_CODES.validationError);
      expect(errorBody.message).toMatch(/loan account/i);
    });

    it('auto-stamps transfer_to_loan when a common_transfer-labeled transfer targets a loan account', async () => {
      // The loan treatment keys off the destination account's category, not
      // the caller's label — otherwise a common_transfer into a loan would
      // mutate the balance while staying invisible to the loan's payment
      // list, the delete guards, and the overpay validation.
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({
          initialBalance: 1_000,
          originalPrincipal: 1_000,
        }),
        raw: true,
      });
      const sourceAccount = await helpers.createAccount({ raw: true });

      const [base, opposite] = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: sourceAccount.id,
            amount: 200,
          }),
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          destinationAmount: 200,
          destinationAccountId: loan.id as RecordId,
        },
        raw: true,
      });

      expect(base.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_loan);
      expect(opposite!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_loan);

      const reloadedLoan = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloadedLoan.currentBalance).toBe(-800);
    });

    it('applies the overpay guard to common_transfer-labeled transfers into a loan account', async () => {
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({
          initialBalance: 1_000,
          originalPrincipal: 1_000,
        }),
        raw: true,
      });
      const sourceAccount = await helpers.createAccount({ raw: true });

      const response = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: sourceAccount.id,
            amount: 2_000,
          }),
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          destinationAmount: 2_000,
          destinationAccountId: loan.id as RecordId,
        },
      });

      expect(response.statusCode).toBe(422);
      const errorBody = extractError(response);
      expect(errorBody.code).toBe(API_ERROR_CODES.validationError);
      expect(errorBody.message).toMatch(/overpay|exceed|owed/i);

      const reloadedLoan = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloadedLoan.currentBalance).toBe(-1_000);
    });

    it('rejects transfer_to_loan combined with destinationTransactionId at schema level', async () => {
      const sourceAccount = await helpers.createAccount({ raw: true });

      const response = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: sourceAccount.id,
          amount: 500,
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
          destinationTransactionId: generateRandomRecordId(),
        }),
      });

      expect(response.statusCode).toBe(422);
    });
  });

  describe('PUT /transactions/:id — transfer kind is frozen on existing pairs', () => {
    it('rejects relabeling an existing common_transfer pair as transfer_to_loan', async () => {
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({
          initialBalance: 1_000,
          originalPrincipal: 1_000,
        }),
        raw: true,
      });
      const [sourceAccount, destinationAccount] = await Promise.all([
        helpers.createAccount({ raw: true }),
        helpers.createAccount({ raw: true }),
      ]);

      const [base] = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: sourceAccount.id,
            amount: 300,
          }),
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          destinationAmount: 300,
          destinationAccountId: destinationAccount.id,
        },
        raw: true,
      });

      const response = await helpers.updateTransaction({
        id: base.id,
        payload: {
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
          destinationAccountId: loan.id as RecordId,
          destinationAmount: 300,
        },
      });

      expect(response.statusCode).toBe(422);
      const errorBody = extractError(response);
      expect(errorBody.code).toBe(API_ERROR_CODES.validationError);
      expect(errorBody.message).toMatch(/transfer kind/i);
    });

    it('rejects relabeling an existing transfer_to_loan pair as common_transfer', async () => {
      const { expenseLeg } = await setupLoanPaymentPair({ initialBalance: 2_500, amount: 500 });
      const regularAccount = await helpers.createAccount({ raw: true });

      const response = await helpers.updateTransaction({
        id: expenseLeg.id,
        payload: {
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          destinationAccountId: regularAccount.id,
          destinationAmount: 500,
        },
      });

      expect(response.statusCode).toBe(422);
      const errorBody = extractError(response);
      expect(errorBody.code).toBe(API_ERROR_CODES.validationError);
      expect(errorBody.message).toMatch(/transfer kind/i);
    });

    it('rejects re-pointing a transfer_to_loan destination to a non-loan account', async () => {
      const { expenseLeg } = await setupLoanPaymentPair({ initialBalance: 2_500, amount: 500 });
      const regularAccount = await helpers.createAccount({ raw: true });

      // Nature is omitted — the pair stays transfer_to_loan, so the destination
      // must remain a loan-category account.
      const response = await helpers.updateTransaction({
        id: expenseLeg.id,
        payload: {
          destinationAccountId: regularAccount.id,
          destinationAmount: 500,
        },
      });

      expect(response.statusCode).toBe(422);
      const errorBody = extractError(response);
      expect(errorBody.code).toBe(API_ERROR_CODES.validationError);
      expect(errorBody.message).toMatch(/loan account/i);
    });

    it('rejects unlinking a loan payment because it would orphan the loan-side leg', async () => {
      // Unlinking sets the loan-side income leg to not_transfer, leaving a
      // standalone transaction on the loan account — which the loan-account
      // write guard forbids. The supported way to undo a payment is to delete
      // it (which restores the balance), not to unlink it.
      const { loan, expenseLeg } = await setupLoanPaymentPair({ initialBalance: 2_500, amount: 500 });

      const response = await helpers.updateTransaction({
        id: expenseLeg.id,
        payload: { transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer },
      });

      expect(response.statusCode).toBe(422);
      const errorBody = extractError(response);
      expect(errorBody.code).toBe(API_ERROR_CODES.validationError);

      // The payment is untouched: the balance still reflects the $500 payment.
      const reloadedLoan = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloadedLoan.currentBalance).toBe(-2_000);
    });
  });

  describe('Overpayment validation', () => {
    it('rejects POST when destinationAmount exceeds the loan currentOwed', async () => {
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({
          initialBalance: 1_000,
          originalPrincipal: 1_000,
        }),
        raw: true,
      });
      const sourceAccount = await helpers.createAccount({ raw: true });

      const response = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: sourceAccount.id,
            amount: 2_000,
          }),
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
          destinationAmount: 2_000,
          destinationAccountId: loan.id as RecordId,
        },
      });

      expect(response.statusCode).toBe(422);
      const errorBody = extractError(response);
      expect(errorBody.code).toBe(API_ERROR_CODES.validationError);
      expect(errorBody.message).toMatch(/overpay|exceed|owed/i);

      const reloadedLoan = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloadedLoan.currentBalance).toBe(-1_000);
    });

    it('accepts POST when destinationAmount equals the loan currentOwed (boundary)', async () => {
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({
          initialBalance: 1_000,
          originalPrincipal: 1_000,
        }),
        raw: true,
      });
      const sourceAccount = await helpers.createAccount({ raw: true });

      const [base, opposite] = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: sourceAccount.id,
            amount: 1_000,
          }),
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
          destinationAmount: 1_000,
          destinationAccountId: loan.id as RecordId,
        },
        raw: true,
      });

      expect(base.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_loan);
      expect(opposite!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_loan);

      const reloadedLoan = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloadedLoan.currentBalance).toBe(0);
    });

    it('rejects PUT that bumps the loan-leg amount past the remaining owed', async () => {
      // Loan owes $1,000. Pay $300 → -$700 owed. Try to edit that payment to
      // $1,500 → would push balance to +$800. Reject.
      const { loan, expenseLeg } = await setupLoanPaymentPair({ initialBalance: 1_000, amount: 300 });

      const paidLoan = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(paidLoan.currentBalance).toBe(-700);

      const response = await helpers.updateTransaction({
        id: expenseLeg.id,
        payload: {
          destinationAmount: 1_500,
        },
      });

      expect(response.statusCode).toBe(422);
      const errorBody = extractError(response);
      expect(errorBody.code).toBe(API_ERROR_CODES.validationError);
      expect(errorBody.message).toMatch(/overpay|exceed|owed/i);

      const reloadedLoan = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloadedLoan.currentBalance).toBe(-700);
    });

    it('accepts PUT that bumps the loan-leg amount up to (but not over) the remaining owed', async () => {
      // Loan owes $1,000. Pay $300 → -$700 owed. Edit to $1,000 — the full
      // payoff boundary (projected balance = 0, exactly at the limit).
      const { loan, expenseLeg } = await setupLoanPaymentPair({ initialBalance: 1_000, amount: 300 });

      const [base, opposite] = await helpers.updateTransaction({
        id: expenseLeg.id,
        payload: { destinationAmount: 1_000 },
        raw: true,
      });

      expect(base.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_loan);
      expect(opposite!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_loan);

      const reloadedLoan = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloadedLoan.currentBalance).toBe(0);
    });

    it('re-points a payment to another loan and moves the balances accordingly', async () => {
      const { loan, expenseLeg } = await setupLoanPaymentPair({ initialBalance: 1_000, amount: 500 });
      const bigLoan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({
          name: 'Big loan',
          initialBalance: 2_000,
          originalPrincipal: 2_000,
        }),
        raw: true,
      });

      const [base, opposite] = await helpers.updateTransaction({
        id: expenseLeg.id,
        payload: { destinationAccountId: bigLoan.id as RecordId, destinationAmount: 500 },
        raw: true,
      });

      expect(base.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_loan);
      expect(opposite!.accountId).toBe(bigLoan.id);

      // The payment leaves the first loan entirely and lands on the second.
      const reloadedOriginal = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloadedOriginal.currentBalance).toBe(-1_000);
      const reloadedBig = await helpers.getLoanById({ id: bigLoan.id, raw: true });
      expect(reloadedBig.currentBalance).toBe(-1_500);
    });

    it('rejects re-pointing a payment to a different loan it would overpay', async () => {
      // Regression: the guard must project against the NEW loan's balance
      // without backing out the old leg (which never touched that loan) —
      // otherwise a $500 payment re-pointed onto a $100 loan slips through
      // and drives it into credit.
      const { loan, expenseLeg } = await setupLoanPaymentPair({ initialBalance: 1_000, amount: 500 });
      const smallLoan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({
          name: 'Small loan',
          initialBalance: 100,
          originalPrincipal: 100,
        }),
        raw: true,
      });

      const response = await helpers.updateTransaction({
        id: expenseLeg.id,
        payload: { destinationAccountId: smallLoan.id as RecordId, destinationAmount: 500 },
      });

      expect(response.statusCode).toBe(422);
      const errorBody = extractError(response);
      expect(errorBody.code).toBe(API_ERROR_CODES.validationError);
      expect(errorBody.message).toMatch(/overpay|exceed|owed/i);

      expect((await helpers.getLoanById({ id: loan.id, raw: true })).currentBalance).toBe(-500);
      expect((await helpers.getLoanById({ id: smallLoan.id, raw: true })).currentBalance).toBe(-100);
    });

    it('runs the overpay guard when only destinationAccountId changes (amount omitted)', async () => {
      // Regression: a PATCH that re-points the destination but keeps the
      // amount must not skip balance validation.
      const { expenseLeg } = await setupLoanPaymentPair({ initialBalance: 1_000, amount: 500 });
      const smallLoan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({
          name: 'Small loan',
          initialBalance: 100,
          originalPrincipal: 100,
        }),
        raw: true,
      });

      const response = await helpers.updateTransaction({
        id: expenseLeg.id,
        payload: { destinationAccountId: smallLoan.id as RecordId },
      });

      expect(response.statusCode).toBe(422);
      const errorBody = extractError(response);
      expect(errorBody.code).toBe(API_ERROR_CODES.validationError);
      expect(errorBody.message).toMatch(/overpay|exceed|owed/i);

      expect((await helpers.getLoanById({ id: smallLoan.id, raw: true })).currentBalance).toBe(-100);
    });

    it('rejects re-pointing a common_transfer pair onto a loan account (unlink first)', async () => {
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({
          initialBalance: 1_000,
          originalPrincipal: 1_000,
        }),
        raw: true,
      });
      const [sourceAccount, destinationAccount] = await Promise.all([
        helpers.createAccount({ raw: true }),
        helpers.createAccount({ raw: true }),
      ]);

      const [base] = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: sourceAccount.id,
            amount: 300,
          }),
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          destinationAmount: 300,
          destinationAccountId: destinationAccount.id,
        },
        raw: true,
      });

      const response = await helpers.updateTransaction({
        id: base.id,
        payload: { destinationAccountId: loan.id as RecordId, destinationAmount: 300 },
      });

      expect(response.statusCode).toBe(422);
      const errorBody = extractError(response);
      expect(errorBody.code).toBe(API_ERROR_CODES.validationError);
      expect(errorBody.message).toMatch(/unlink/i);

      const reloadedLoan = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloadedLoan.currentBalance).toBe(-1_000);
    });

    it('rejects POST overpay when source account currency differs from the loan currency', async () => {
      // Loan in USD owes $1,000. Source account in UAH. Even though the
      // source-side amount is in UAH, the overpay check must compare
      // destinationAmount (loan currency, USD) against the loan's owed
      // balance. $2,000 destination overshoots regardless of UAH amount.
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({
          initialBalance: 1_000,
          originalPrincipal: 1_000,
          currencyCode: 'USD',
        }),
        raw: true,
      });
      const { account: uahAccount } = await helpers.createAccountWithNewCurrency({ currency: 'UAH' });

      const response = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: uahAccount.id,
            amount: 82_800, // approximately $2,000 worth of UAH
          }),
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
          destinationAmount: 2_000,
          destinationAccountId: loan.id as RecordId,
        },
      });

      expect(response.statusCode).toBe(422);
      const errorBody = extractError(response);
      expect(errorBody.code).toBe(API_ERROR_CODES.validationError);
      expect(errorBody.message).toMatch(/overpay|exceed|owed/i);

      const reloadedLoan = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloadedLoan.currentBalance).toBe(-1_000);
    });

    it('blocks two concurrent POSTs from together overpaying the loan', async () => {
      // Loan owes $1,000. Two concurrent $700 payments each pass the
      // individual overpay check (1000 - 700 = 300 still owed) — but applied
      // together they would push the loan to +$400. Row-level locking on the
      // loan account must force them to serialize so exactly one succeeds.
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({
          initialBalance: 1_000,
          originalPrincipal: 1_000,
        }),
        raw: true,
      });
      const [sourceA, sourceB] = await Promise.all([
        helpers.createAccount({ raw: true }),
        helpers.createAccount({ raw: true }),
      ]);

      const buildPayload = (sourceAccountId: RecordId) => ({
        ...helpers.buildTransactionPayload({ accountId: sourceAccountId, amount: 700 }),
        transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
        destinationAmount: 700,
        destinationAccountId: loan.id as RecordId,
      });

      const [resA, resB] = await Promise.all([
        helpers.createTransaction({ payload: buildPayload(sourceA.id as RecordId) }),
        helpers.createTransaction({ payload: buildPayload(sourceB.id as RecordId) }),
      ]);

      const statuses = [resA.statusCode, resB.statusCode].toSorted();
      expect(statuses).toEqual([200, 422]);

      const reloadedLoan = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloadedLoan.currentBalance).toBe(-300);
    });
  });

  describe('DELETE /transactions/:id on a transfer_to_loan pair', () => {
    it('removes both legs and restores the loan balance', async () => {
      const { loan, expenseLeg } = await setupLoanPaymentPair({ initialBalance: 2_500, amount: 500 });

      const paidLoan = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(paidLoan.currentBalance).toBe(-2_000);

      const response = await helpers.deleteTransaction({ id: expenseLeg.id });
      expect(response.statusCode).toBe(200);

      const txsAfterDeletion = await helpers.getTransactions({ raw: true });
      expect(txsAfterDeletion.length).toBe(0);

      const reloadedLoan = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloadedLoan.currentBalance).toBe(-2_500);
    });

    it('removes both legs and restores the loan balance when the income (loan-side) leg is deleted', async () => {
      const { loan, base, opposite, expenseLeg } = await setupLoanPaymentPair({ initialBalance: 2_500, amount: 500 });
      const incomeLeg = base.id === expenseLeg.id ? opposite : base;

      const response = await helpers.deleteTransaction({ id: incomeLeg.id });
      expect(response.statusCode).toBe(200);

      const txsAfterDeletion = await helpers.getTransactions({ raw: true });
      expect(txsAfterDeletion.length).toBe(0);

      const reloadedLoan = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloadedLoan.currentBalance).toBe(-2_500);
    });
  });

  describe('Loan accounts reject direct writes outside the transfer_to_loan flow', () => {
    it('rejects a plain income transaction posted directly onto a loan account', async () => {
      // A loan balance may only move through the validated transfer_to_loan
      // flow. A standalone income leg would bump it (here toward credit) with
      // no overpay check and no payment record the loan guards can see.
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({
          initialBalance: 1_000,
          originalPrincipal: 1_000,
        }),
        raw: true,
      });

      const response = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: loan.id as RecordId,
          amount: 500,
          transactionType: TRANSACTION_TYPES.income,
          transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
        }),
      });

      expect(response.statusCode).toBe(422);
      const errorBody = extractError(response);
      expect(errorBody.code).toBe(API_ERROR_CODES.validationError);

      const reloadedLoan = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloadedLoan.currentBalance).toBe(-1_000);
    });

    it('rejects a plain expense transaction posted directly onto a loan account', async () => {
      // The mirror hole: a standalone expense leg drives the loan deeper into
      // debt, again skipping the payment flow and its audit trail.
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({
          initialBalance: 1_000,
          originalPrincipal: 1_000,
        }),
        raw: true,
      });

      const response = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: loan.id as RecordId,
          amount: 500,
          transactionType: TRANSACTION_TYPES.expense,
          transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
        }),
      });

      expect(response.statusCode).toBe(422);
      const errorBody = extractError(response);
      expect(errorBody.code).toBe(API_ERROR_CODES.validationError);

      const reloadedLoan = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloadedLoan.currentBalance).toBe(-1_000);
    });

    it('rejects a common_transfer that uses the loan account as the transfer source', async () => {
      // With the loan as the source, the expense leg lands on the loan but is
      // labeled common_transfer — so it moves the balance yet stays invisible
      // to the loan/account delete guards that only recognise transfer_to_loan.
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({
          initialBalance: 1_000,
          originalPrincipal: 1_000,
        }),
        raw: true,
      });
      const cashAccount = await helpers.createAccount({ raw: true });

      const response = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: loan.id as RecordId,
            amount: 300,
          }),
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          destinationAmount: 300,
          destinationAccountId: cashAccount.id as RecordId,
        },
      });

      expect(response.statusCode).toBe(422);
      const errorBody = extractError(response);
      expect(errorBody.code).toBe(API_ERROR_CODES.validationError);

      const reloadedLoan = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloadedLoan.currentBalance).toBe(-1_000);
    });

    it('still accepts a legitimate transfer_to_loan payment from a cash account into the loan', async () => {
      // Regression: the readonly guard must let the only sanctioned write
      // through — the income leg of a transfer_to_loan payment — and move the
      // loan balance toward zero. This passes before and after the guard ships.
      const { loan } = await setupLoanPaymentPair({ initialBalance: 1_000, amount: 400 });

      const reloadedLoan = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloadedLoan.currentBalance).toBe(-600);
    });
  });

  describe('rejects an income base for a loan payment', () => {
    it('rejects a transfer_to_loan whose base transaction is income', async () => {
      // A loan payment is an outflow: the base leg must be the expense that
      // leaves the user's cash account. An income base would invert both legs,
      // stamping the loan with an expense leg that grows the debt.
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({ initialBalance: 1_000, originalPrincipal: 1_000 }),
        raw: true,
      });
      const sourceAccount = await helpers.createAccount({ raw: true });

      const response = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: sourceAccount.id,
            amount: 300,
            transactionType: TRANSACTION_TYPES.income,
          }),
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
          destinationAmount: 300,
          destinationAccountId: loan.id as RecordId,
        },
      });

      expect(response.statusCode).toBe(422);
      const errorBody = extractError(response);
      expect(errorBody.code).toBe(API_ERROR_CODES.validationError);

      const reloadedLoan = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloadedLoan.currentBalance).toBe(-1_000);
    });

    it('rejects an income base even when labeled common_transfer (the loan auto-stamp path)', async () => {
      // A common_transfer into a loan account is auto-stamped transfer_to_loan,
      // so the income guard keys off the loan destination — not the label — to
      // catch this otherwise-bypassing case.
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({ initialBalance: 1_000, originalPrincipal: 1_000 }),
        raw: true,
      });
      const sourceAccount = await helpers.createAccount({ raw: true });

      const response = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: sourceAccount.id,
            amount: 300,
            transactionType: TRANSACTION_TYPES.income,
          }),
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          destinationAmount: 300,
          destinationAccountId: loan.id as RecordId,
        },
      });

      expect(response.statusCode).toBe(422);
      const errorBody = extractError(response);
      expect(errorBody.code).toBe(API_ERROR_CODES.validationError);

      const reloadedLoan = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloadedLoan.currentBalance).toBe(-1_000);
    });

    it('rejects promoting an existing income transaction into a transfer_to_loan via update', async () => {
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({ initialBalance: 1_000, originalPrincipal: 1_000 }),
        raw: true,
      });
      const sourceAccount = await helpers.createAccount({ raw: true });

      const [incomeTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: sourceAccount.id,
          amount: 300,
          transactionType: TRANSACTION_TYPES.income,
        }),
        raw: true,
      });

      const response = await helpers.updateTransaction({
        id: incomeTx.id,
        payload: {
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
          destinationAmount: 300,
          destinationAccountId: loan.id as RecordId,
        },
      });

      expect(response.statusCode).toBe(422);
      const errorBody = extractError(response);
      expect(errorBody.code).toBe(API_ERROR_CODES.validationError);

      const reloadedLoan = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloadedLoan.currentBalance).toBe(-1_000);
    });
  });
});
