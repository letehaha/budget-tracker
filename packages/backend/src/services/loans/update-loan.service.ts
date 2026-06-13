import type { LoanEvent } from '@bt/shared/types';
import type { Money } from '@common/types/money';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import Accounts from '@models/accounts.model';
import LoanDetails from '@models/loan-details.model';
import { updateAccount } from '@services/accounts.service';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { withTransaction } from '@services/common/with-transaction';

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
  const { userId, accountId, name, currentBalance, appendNote, ...detailFields } = params;

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
  // balance doesn't append a bogus event or re-snapshot refCurrentBalance at
  // today's FX rate.
  let newLedgerBalance: Money | null = null;
  if (currentBalance !== undefined && !currentBalance.negate().equals(loan.account.currentBalance)) {
    newLedgerBalance = currentBalance.negate();
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

  if (Object.keys(detailUpdates).length > 0) {
    await loan.update(detailUpdates);
  }

  if (name !== undefined || newLedgerBalance !== null) {
    // Canonical account-update path: shifts initialBalance by the balance
    // diff (preserving `currentBalance = initialBalance + Σtransactions` for
    // system accounts), recalculates refCurrentBalance, and propagates the
    // change into the Balances history table — a direct `Accounts.update`
    // would silently skip all three.
    await updateAccount({
      id: accountId,
      userId,
      ...(name !== undefined ? { name } : {}),
      // `loanBalanceCorrection` authorises the loan-balance write that
      // `updateAccount` otherwise rejects: this is the one path allowed to set a
      // loan's currentBalance, having already negated it and recorded the
      // balance_correction event above. Travels with the balance only.
      ...(newLedgerBalance !== null ? { currentBalance: newLedgerBalance, loanBalanceCorrection: true } : {}),
    });
  }

  return loan.reload({ include: [{ model: Accounts, as: 'account' }] });
};

export const updateLoan = withTransaction(updateLoanImpl);
