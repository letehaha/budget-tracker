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
      // Loan starts at -$2,500 (a positive 2500 initialBalance gets sign-flipped by create-loan)
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

      // Loan leg is the income side; the source leg is the expense.
      const loanLeg = base.accountId === loan.id ? base : opposite!;
      const sourceLeg = base.accountId === sourceAccount.id ? base : opposite!;
      expect(loanLeg.accountId).toBe(loan.id);
      expect(loanLeg.transactionType).toBe(TRANSACTION_TYPES.income);
      expect(sourceLeg.accountId).toBe(sourceAccount.id);
      expect(sourceLeg.transactionType).toBe(TRANSACTION_TYPES.expense);

      const reloadedLoan = await helpers.getLoanById({ id: loan.id, raw: true });
      // Started at -2500 (debt); $500 payment brings it to -2000.
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
      // On error responses the success-typed body is replaced by an error envelope;
      // cast through unknown to read the `code` discriminator.
      const errorBody = extractError(response);
      expect(errorBody.code).toBe(API_ERROR_CODES.validationError);
      expect(errorBody.message).toMatch(/loan account/i);
    });

    it('accepts common_transfer into a loan-category account (backward compatible — nature mismatch is allowed)', async () => {
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

      expect(base.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);
      expect(opposite!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);

      const reloadedLoan = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloadedLoan.currentBalance).toBe(-800);
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

    it('supports unlink (not_transfer) then re-marking the expense as transfer_to_loan', async () => {
      const { loan, expenseLeg } = await setupLoanPaymentPair({ initialBalance: 2_500, amount: 500 });

      const [unlinked] = await helpers.updateTransaction({
        id: expenseLeg.id,
        payload: { transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer },
        raw: true,
      });

      expect(unlinked.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
      expect(unlinked.transferId).toBe(null);

      const [base, opposite] = await helpers.updateTransaction({
        id: expenseLeg.id,
        payload: {
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
          destinationAccountId: loan.id as RecordId,
          destinationAmount: 500,
        },
        raw: true,
      });

      expect(base.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_loan);
      expect(opposite!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_loan);
      expect(base.transferId).toBeTruthy();
      expect(opposite!.transferId).toBe(base.transferId);

      const pairLegs = await helpers.getTransactionsByTransferId({
        transferId: base.transferId!,
        raw: true,
      });
      expect(pairLegs.length).toBe(2);
      expect(pairLegs.every((tx) => tx.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_to_loan)).toBe(true);
    });
  });

  describe('Overpayment validation', () => {
    it('rejects POST when destinationAmount exceeds the loan currentOwed', async () => {
      // Loan owes $1,000 (initialBalance gets sign-flipped to -1,000 currentBalance).
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

      // Loan balance must be untouched.
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

      // Balance must stay at the pre-edit value.
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

      // Exactly one payment landed, so the loan should be at -$300 owed, never positive.
      const reloadedLoan = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloadedLoan.currentBalance).toBe(-300);
    });
  });

  describe('DELETE /transactions/:id on a transfer_to_loan pair', () => {
    it('removes both legs and restores the loan balance', async () => {
      const { loan, expenseLeg } = await setupLoanPaymentPair({ initialBalance: 2_500, amount: 500 });

      // Sanity: the payment landed before deletion.
      const paidLoan = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(paidLoan.currentBalance).toBe(-2_000);

      const response = await helpers.deleteTransaction({ id: expenseLeg.id });
      expect(response.statusCode).toBe(200);

      const txsAfterDeletion = await helpers.getTransactions({ raw: true });
      expect(txsAfterDeletion.length).toBe(0);

      const reloadedLoan = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloadedLoan.currentBalance).toBe(-2_500);
    });
  });
});
