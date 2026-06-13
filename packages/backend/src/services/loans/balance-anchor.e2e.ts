import { TRANSACTION_TRANSFER_NATURE, type RecordId } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { format, subDays } from 'date-fns';

/** Yesterday as a yyyy-MM-dd string. */
const YESTERDAY = format(subDays(new Date(), 1), 'yyyy-MM-dd');

/** Today as a yyyy-MM-dd string, matching the anchor date set at loan creation. */
const TODAY = format(new Date(), 'yyyy-MM-dd');

/** ISO timestamp 30 days in the past — safely before the creation-date anchor. */
const PAST_ISO = subDays(new Date(), 30).toISOString();

/**
 * Base-currency loan with originalPrincipal=250000, initialBalance=175000.
 * At creation: currentBalance = -175000, paidToDate = 250000 - 175000 = 75000,
 * balanceAnchorDate = today.
 */
function buildAnchorLoanPayload(overrides: Record<string, unknown> = {}) {
  return helpers.buildCreateLoanPayload({
    currencyCode: global.BASE_CURRENCY_CODE,
    originalPrincipal: 250_000,
    initialBalance: 175_000,
    ...overrides,
  });
}

describe('Loan balance anchor', () => {
  describe('initial state', () => {
    it('sets balanceAnchorDate to today and paidToDate = originalPrincipal − |currentBalance| at creation', async () => {
      const loan = await helpers.createLoan({
        payload: buildAnchorLoanPayload(),
        raw: true,
      });

      expect(loan.currentBalance).toBe(-175_000);
      expect(loan.loanDetails.balanceAnchorDate).toBe(TODAY);
      expect(loan.projection.paidToDate).toBe(75_000);
    });
  });

  describe('pre-anchor payments are informational', () => {
    it('a transfer_to_loan dated before the anchor does NOT reduce the outstanding or paidToDate', async () => {
      // Headline anchor bug: back-tagging a payment must not move the balance
      // because that amount is already baked into the opening snapshot.
      const loan = await helpers.createLoan({
        payload: buildAnchorLoanPayload(),
        raw: true,
      });
      const sourceAccount = await helpers.createAccount({ raw: true });

      // Payment dated 30 days in the past — strictly before the anchor (today).
      const [base] = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: sourceAccount.id,
            amount: 5_000,
            time: PAST_ISO,
          }),
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
          destinationAmount: 5_000,
          destinationAccountId: loan.id as RecordId,
        },
        raw: true,
      });

      expect(base).toBeDefined();

      const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });
      // Pre-anchor payment must not change paidToDate or the outstanding.
      expect(reloaded.currentBalance).toBe(-175_000);
      expect(reloaded.projection.paidToDate).toBe(75_000);
      // A pre-anchor payment must not shift the anchor forward — the anchor
      // must remain pinned to the creation date (today).
      expect(reloaded.loanDetails.balanceAnchorDate).toBe(TODAY);
    });

    it('deleting a pre-anchor payment leaves paidToDate unchanged', async () => {
      // Deleting an informational (pre-anchor) payment must also be a no-op
      // for the balance: there was nothing to remove from the outstanding.
      const loan = await helpers.createLoan({
        payload: buildAnchorLoanPayload(),
        raw: true,
      });
      const sourceAccount = await helpers.createAccount({ raw: true });

      const [base] = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: sourceAccount.id,
            amount: 5_000,
            time: PAST_ISO,
          }),
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
          destinationAmount: 5_000,
          destinationAccountId: loan.id as RecordId,
        },
        raw: true,
      });

      await helpers.deleteTransaction({ id: base.id });

      const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(reloaded.currentBalance).toBe(-175_000);
      expect(reloaded.projection.paidToDate).toBe(75_000);
    });
  });

  describe('on/after-anchor payments reduce the outstanding', () => {
    it('a transfer_to_loan dated today (>= anchor) reduces the outstanding and raises paidToDate', async () => {
      const loan = await helpers.createLoan({
        payload: buildAnchorLoanPayload(),
        raw: true,
      });
      const sourceAccount = await helpers.createAccount({ raw: true });

      // Payment dated today — on the anchor boundary.
      await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: sourceAccount.id,
            amount: 5_000,
          }),
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
          destinationAmount: 5_000,
          destinationAccountId: loan.id as RecordId,
        },
        raw: true,
      });

      const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });
      // 175000 − 5000 = 170000 outstanding; 250000 − 170000 = 80000 paid.
      expect(reloaded.currentBalance).toBe(-170_000);
      expect(reloaded.projection.paidToDate).toBe(80_000);
    });

    it('deleting an on/after-anchor payment restores the outstanding and paidToDate', async () => {
      const loan = await helpers.createLoan({
        payload: buildAnchorLoanPayload(),
        raw: true,
      });
      const sourceAccount = await helpers.createAccount({ raw: true });

      const [base] = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: sourceAccount.id,
            amount: 5_000,
          }),
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
          destinationAmount: 5_000,
          destinationAccountId: loan.id as RecordId,
        },
        raw: true,
      });

      const afterPayment = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(afterPayment.currentBalance).toBe(-170_000);
      expect(afterPayment.projection.paidToDate).toBe(80_000);

      await helpers.deleteTransaction({ id: base.id });

      const restored = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(restored.currentBalance).toBe(-175_000);
      expect(restored.projection.paidToDate).toBe(75_000);
    });

    it('attempting to unlink a transfer_to_loan payment is rejected with 422 (delete is the only undo path)', async () => {
      // Unlinking would orphan the loan-side income leg as a standalone
      // transaction, which the loan-account write guard forbids. The supported
      // way to undo a payment is deletion — this regression pin documents that
      // unlinking stays blocked even for anchor-eligible payments.
      const loan = await helpers.createLoan({
        payload: buildAnchorLoanPayload(),
        raw: true,
      });
      const sourceAccount = await helpers.createAccount({ raw: true });

      const [base] = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: sourceAccount.id,
            amount: 5_000,
          }),
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
          destinationAmount: 5_000,
          destinationAccountId: loan.id as RecordId,
        },
        raw: true,
      });

      const afterPayment = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(afterPayment.currentBalance).toBe(-170_000);

      // Attempt unlink — must be rejected.
      const unlinkResponse = await helpers.unlinkTransferTransactions({
        transferIds: [base.transferId as string],
        raw: false,
      });
      expect(unlinkResponse.statusCode).toBe(422);

      // Outstanding must be unchanged after the rejected unlink.
      const stillPaid = await helpers.getLoanById({ id: loan.id, raw: true });
      expect(stillPaid.currentBalance).toBe(-170_000);
      expect(stillPaid.projection.paidToDate).toBe(80_000);
    });
  });

  describe('balance correction re-anchors the loan', () => {
    it('PATCH /loans/:id with currentBalance re-states the outstanding, updates paidToDate, and records a balance_correction event with the new anchor date', async () => {
      const loan = await helpers.createLoan({
        payload: buildAnchorLoanPayload(),
        raw: true,
      });

      // Correct the outstanding from 175000 to 160000.
      // paidToDate = 250000 − 160000 = 90000.
      const updated = await helpers.updateLoan({
        id: loan.id,
        payload: { currentBalance: 160_000, currentBalanceAsOf: TODAY },
        raw: true,
      });

      // API stores balance negative (liability convention).
      expect(updated.currentBalance).toBe(-160_000);
      expect(updated.projection.paidToDate).toBe(90_000);
      expect(updated.loanDetails.balanceAnchorDate).toBe(TODAY);

      // A balance_correction event must appear in the loan timeline.
      const correctionEvent = updated.loanDetails.events.find((e) => e.type === 'balance_correction');
      expect(correctionEvent).toBeDefined();
      if (correctionEvent?.type === 'balance_correction') {
        expect(correctionEvent.from).toBe(175_000);
        expect(correctionEvent.to).toBe(160_000);
      }
    });
  });

  describe('cross-currency (FX) recompute', () => {
    it('pins refCurrentBalance: a post-anchor payment reduces both currentBalance and refCurrentBalance by the payment amounts', async () => {
      // Regression pin: the recompute path writes BOTH currentBalance and
      // refCurrentBalance. This test is the first coverage for the ref path.
      //
      // Base currency is AED; use USD so the loan is in a foreign currency
      // and the system must maintain a separate ref-currency balance.
      await helpers.addUserCurrencies({ currencyCodes: ['USD'] });

      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({
          currencyCode: 'USD',
          originalPrincipal: 10_000,
          initialBalance: 8_000,
        }),
        raw: true,
      });

      // refCurrentBalance must be present and non-zero after creation.
      expect(loan.refCurrentBalance).toBeDefined();
      expect(loan.refCurrentBalance).not.toBe(0);
      // Outstanding is negative (liability convention).
      expect(loan.currentBalance).toBe(-8_000);
      expect(loan.refCurrentBalance).toBeLessThan(0);

      const balanceBefore = loan.currentBalance;
      const refBalanceBefore = loan.refCurrentBalance;

      const sourceAccount = await helpers.createAccount({ raw: true });

      // Post-anchor payment (today) — should reduce both balances.
      const [base] = await helpers.createTransaction({
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

      // Fetch the serialized transaction to read decimal amount/refAmount.
      const paidTx = await helpers.getTransactionById({ id: base.id, raw: true });
      expect(paidTx).not.toBeNull();
      const paymentAmount = paidTx!.amount;
      const paymentRefAmount = paidTx!.refAmount;

      const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });

      // currentBalance moved toward zero by exactly the payment's amount.
      expect(reloaded.currentBalance).toBeCloseTo(balanceBefore + paymentAmount, 2);
      // refCurrentBalance moved toward zero by exactly the payment's refAmount.
      expect(reloaded.refCurrentBalance).toBeCloseTo(refBalanceBefore + paymentRefAmount, 2);
    });
  });

  describe('anchor date manipulation', () => {
    it('moving the anchor backward keeps later payments counted against the corrected balance', async () => {
      // Loan created with outstanding 10000, anchor = today.
      const loan = await helpers.createLoan({
        payload: buildAnchorLoanPayload({
          originalPrincipal: 10_000,
          initialBalance: 10_000,
        }),
        raw: true,
      });

      expect(loan.currentBalance).toBe(-10_000);

      const sourceAccount = await helpers.createAccount({ raw: true });

      // Payment of 2000 dated today — on the anchor, so it counts.
      await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: sourceAccount.id,
            amount: 2_000,
          }),
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
          destinationAmount: 2_000,
          destinationAccountId: loan.id as RecordId,
        },
        raw: true,
      });

      const afterPayment = await helpers.getLoanById({ id: loan.id, raw: true });
      // 10000 − 2000 = 8000 outstanding.
      expect(afterPayment.currentBalance).toBe(-8_000);

      // Move the anchor back one day with a corrected balance of 7000.
      // The today-dated 2000 payment is still on/after the new (earlier) anchor,
      // so it continues to reduce the outstanding.
      await helpers.updateLoan({
        id: loan.id,
        payload: { currentBalance: 7_000, currentBalanceAsOf: YESTERDAY },
        raw: true,
      });

      const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });
      // Corrected balance 7000 minus the 2000 payment that post-dates the new
      // anchor (yesterday) = 5000 outstanding.
      expect(reloaded.currentBalance).toBe(-5_000);
    });

    it('a correction re-counts a payment dated on the same day as the correction (inclusive >= boundary)', async () => {
      // The `>=` anchor boundary intentionally counts a payment whose date
      // equals the correction's as-of date. The corrected balance represents
      // the outstanding *before* that day's payments have been applied, so any
      // payment recorded on the same day is still post-anchor and must reduce
      // the outstanding. The same rationale is documented at the correction
      // site in update-loan.service.ts.
      const loan = await helpers.createLoan({
        payload: buildAnchorLoanPayload({
          originalPrincipal: 10_000,
          initialBalance: 10_000,
        }),
        raw: true,
      });

      expect(loan.currentBalance).toBe(-10_000);

      const sourceAccount = await helpers.createAccount({ raw: true });

      // Payment of 2000 dated today — on the anchor, so it counts.
      await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: sourceAccount.id,
            amount: 2_000,
          }),
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
          destinationAmount: 2_000,
          destinationAccountId: loan.id as RecordId,
        },
        raw: true,
      });

      const afterPayment = await helpers.getLoanById({ id: loan.id, raw: true });
      // 10000 − 2000 = 8000 outstanding.
      expect(afterPayment.currentBalance).toBe(-8_000);

      // Re-anchor to today with a corrected opening balance of 10000. It must
      // differ from the current 8000 outstanding, otherwise the echo-guard in
      // update-loan.service drops the write as a no-op. Because the anchor
      // boundary is inclusive (>=), today's 2000 payment is NOT absorbed into
      // the new snapshot — it stays a post-anchor leg and is re-applied on top
      // of the corrected 10000. This pins the documented same-day rule (see the
      // correction comment in update-loan.service.ts); a strict `>` here would
      // make today's payment informational and yield -10000 instead.
      await helpers.updateLoan({
        id: loan.id,
        payload: { currentBalance: 10_000, currentBalanceAsOf: TODAY },
        raw: true,
      });

      const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });
      // Corrected opening 10000 minus the same-day 2000 payment (still counted) = 8000.
      expect(reloaded.currentBalance).toBe(-8_000);
    });

    it('editing a payment date across the anchor boundary toggles whether it reduces the outstanding', async () => {
      // Loan created with outstanding 10000, anchor = today.
      const loan = await helpers.createLoan({
        payload: buildAnchorLoanPayload({
          originalPrincipal: 10_000,
          initialBalance: 10_000,
        }),
        raw: true,
      });

      const sourceAccount = await helpers.createAccount({ raw: true });

      // Payment of 1000 dated 30 days ago — strictly pre-anchor → informational.
      const [base] = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: sourceAccount.id,
            amount: 1_000,
            time: PAST_ISO,
          }),
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
          destinationAmount: 1_000,
          destinationAccountId: loan.id as RecordId,
        },
        raw: true,
      });

      const afterPreAnchor = await helpers.getLoanById({ id: loan.id, raw: true });
      // Pre-anchor payment is informational — outstanding unchanged.
      expect(afterPreAnchor.currentBalance).toBe(-10_000);

      // Move the payment date to today — it now crosses into the counted window.
      await helpers.updateTransaction({
        id: base.id,
        payload: { time: new Date().toISOString() },
        raw: false,
      });

      const afterCrossForward = await helpers.getLoanById({ id: loan.id, raw: true });
      // Payment is now post-anchor: 10000 − 1000 = 9000.
      expect(afterCrossForward.currentBalance).toBe(-9_000);

      // Move the payment date back to the past — it becomes informational again.
      await helpers.updateTransaction({
        id: base.id,
        payload: { time: PAST_ISO },
        raw: false,
      });

      const afterCrossBack = await helpers.getLoanById({ id: loan.id, raw: true });
      // Payment is pre-anchor again — outstanding restored to 10000.
      expect(afterCrossBack.currentBalance).toBe(-10_000);
    });
  });

  describe('balance correction validation', () => {
    it('rejects currentBalanceAsOf in the future with 422', async () => {
      const loan = await helpers.createLoan({
        payload: buildAnchorLoanPayload(),
        raw: true,
      });

      // A future anchor date is nonsensical — the balance can only be known
      // up to today, not a date that has not yet occurred.
      const response = await helpers.updateLoan({
        id: loan.id,
        payload: { currentBalance: 5_000, currentBalanceAsOf: '2099-01-01' },
        raw: false,
      });

      expect(response.statusCode).toBe(422);
    });
  });
});
