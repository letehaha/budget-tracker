import type { LoanEvent } from '@bt/shared/types';
import type { Money } from '@common/types/money';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import Accounts from '@models/accounts.model';
import LoanDetails from '@models/loan-details.model';
import { updateAccount } from '@services/accounts.service';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { withTransaction } from '@services/common/with-transaction';
import { recomputeLoanBalance } from '@services/loans/recompute-loan-balance.service';
import { format } from 'date-fns';

import type { UpdateLoanBody } from './zod-schemas';

interface UpdateLoanParams extends UpdateLoanBody {
  userId: number;
  accountId: string;
  /**
   * Internal-only hook used by POST /loans/:id/events. Not part of the PATCH
   * API surface; the dedicated endpoint translates its body.text into this
   * field so both code paths share one service.
   */
  appendNote?: string;
}

const updateLoanImpl = async (params: UpdateLoanParams) => {
  const { userId, accountId, name, currentBalance, currentBalanceAsOf, appendNote, ...detailFields } = params;

  const loan = await findOrThrowNotFound({
    query: LoanDetails.findOne({
      where: { accountId, userId },
      include: [{ model: Accounts, as: 'account' }],
    }),
    message: t({ key: 'loans.loanNotFound' }),
  });

  const now = new Date();
  const newEvents: LoanEvent[] = [];
  const detailUpdates: Record<string, unknown> = {};

  if (detailFields.interestRate !== undefined && loan.interestRate !== detailFields.interestRate) {
    newEvents.push({
      type: 'rate_change',
      at: now.toISOString(),
      from: loan.interestRate,
      to: detailFields.interestRate,
    });
    detailUpdates.interestRate = detailFields.interestRate;
  }

  if (detailFields.termMonths !== undefined && detailFields.termMonths !== loan.termMonths) {
    // `null` is a meaningful value here ("no term set") — recorded as-is so
    // the timeline can distinguish "term cleared" from "term set to N months".
    newEvents.push({
      type: 'term_change',
      at: now.toISOString(),
      from: loan.termMonths,
      to: detailFields.termMonths ?? null,
    });
    detailUpdates.termMonths = detailFields.termMonths;
  }

  if (detailFields.plannedPayment !== undefined) {
    const currentCents = loan.plannedPayment === null ? null : loan.plannedPayment.toCents();
    const nextCents = detailFields.plannedPayment === null ? null : detailFields.plannedPayment.toCents();
    if (currentCents !== nextCents) {
      // `null` means "no planned payment set" — recorded as-is so the
      // timeline can distinguish "cleared" from "set to zero".
      newEvents.push({
        type: 'planned_payment_change',
        at: now.toISOString(),
        fromCents: currentCents,
        toCents: nextCents,
      });
      detailUpdates.plannedPayment = detailFields.plannedPayment;
      detailUpdates.refPlannedPayment =
        detailFields.plannedPayment === null
          ? null
          : await calculateRefAmount({
              userId,
              amount: detailFields.plannedPayment,
              baseCode: loan.account.currencyCode,
              date: now,
            });
    }
  }

  if (detailFields.minPayment !== undefined) {
    detailUpdates.minPayment = detailFields.minPayment;
    detailUpdates.refMinPayment =
      detailFields.minPayment === null
        ? null
        : await calculateRefAmount({
            userId,
            amount: detailFields.minPayment,
            baseCode: loan.account.currencyCode,
            date: now,
          });
  }

  if (detailFields.startDate !== undefined) detailUpdates.startDate = detailFields.startDate;
  if (detailFields.paymentDayOfMonth !== undefined) detailUpdates.paymentDayOfMonth = detailFields.paymentDayOfMonth;
  if (detailFields.lenderName !== undefined) detailUpdates.lenderName = detailFields.lenderName;
  if (detailFields.accountNumber !== undefined) detailUpdates.accountNumber = detailFields.accountNumber;

  if (appendNote !== undefined) {
    newEvents.push({ type: 'note', at: now.toISOString(), text: appendNote });
  }

  // API takes a positive outstanding amount; loan accounts persist it as a
  // negative ledger balance so net worth aggregation includes liabilities.
  // Same-value writes are dropped so a PATCH that merely echoes the current
  // balance doesn't append a bogus event or move the anchor.
  let anchorInitialBalance: Money | null = null;
  let anchorRefInitialBalance: Money | null = null;
  if (currentBalance !== undefined && !currentBalance.negate().equals(loan.account.currentBalance)) {
    // A correction re-states the outstanding *as-of* a date, so it moves the
    // balance anchor rather than shifting it by a diff: the new amount becomes
    // the anchor balance (Account.initialBalance) on the asserted date, and
    // `recomputeLoanBalance` then folds in any post-anchor payment legs.
    //
    // The anchor boundary is inclusive (recompute sums legs dated >= the anchor
    // date), so a payment dated on the same day as the correction is counted on
    // top of the corrected amount — the corrected balance is taken as the
    // outstanding *before* that day's payments, not after. This is what keeps
    // the "open a loan today, log today's payment, watch the balance drop" flow
    // working. The accepted trade-off: a user who corrects to a post-payment
    // statement balance on a day they also logged that payment sees it applied
    // twice. Same-day correction + payment is a narrow overlap left as-is.
    const asOfDate = currentBalanceAsOf ?? format(now, 'yyyy-MM-dd');
    anchorInitialBalance = currentBalance.negate();
    anchorRefInitialBalance = await calculateRefAmount({
      userId,
      amount: anchorInitialBalance,
      baseCode: loan.account.currencyCode,
      date: now,
    });
    detailUpdates.balanceAnchorDate = asOfDate;
    // Manual balance edits bypass the payment flow, so they leave no
    // transaction trail — the timeline event is the only record reconciling
    // the projection's paidToDate with the recorded payment history.
    newEvents.push({
      type: 'balance_correction',
      at: now.toISOString(),
      fromCents: loan.account.currentBalance.abs().toCents(),
      toCents: currentBalance.toCents(),
    });
  }

  if (newEvents.length > 0) {
    detailUpdates.events = [...(loan.events ?? []), ...newEvents];
  }

  // Persist the sidecar (including the moved anchor date) first: the recompute
  // below reads `balanceAnchorDate` to decide which payment legs are post-anchor.
  if (Object.keys(detailUpdates).length > 0) {
    await loan.update(detailUpdates);
  }

  // A name-only change still routes through the canonical account-update path;
  // the balance write is handled separately below because a correction sets the
  // anchor directly rather than shifting initialBalance by a diff.
  if (name !== undefined) {
    await updateAccount({ id: accountId, userId, name });
  }

  if (anchorInitialBalance !== null && anchorRefInitialBalance !== null) {
    // Set the anchor balance directly — the canonical updateAccount path shifts
    // initialBalance by the balance diff, which would defeat re-anchoring. The
    // authoritative currentBalance/refCurrentBalance + today's Balances row are
    // derived from this anchor by recomputeLoanBalance immediately after.
    await Accounts.update(
      { initialBalance: anchorInitialBalance, refInitialBalance: anchorRefInitialBalance },
      { where: { id: accountId } },
    );

    // Recompute last: it depends on both the new anchor date (on LoanDetails)
    // and the new initialBalance (on Accounts) already being persisted, then
    // sums the post-anchor legs into the authoritative currentBalance and the
    // Balances history row. Only a correction touches the anchor, so non-balance
    // PATCHes leave the recomputed balance untouched.
    await recomputeLoanBalance({ loanAccountId: accountId });
  }

  return loan.reload({ include: [{ model: Accounts, as: 'account' }] });
};

export const updateLoan = withTransaction(updateLoanImpl);
