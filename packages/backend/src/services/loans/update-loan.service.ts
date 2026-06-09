import type { LoanEvent } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import Accounts from '@models/accounts.model';
import LoanDetails from '@models/loan-details.model';
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

  if (detailFields.interestRate !== undefined) {
    const currentRate = Number(loan.interestRate);
    if (currentRate !== detailFields.interestRate) {
      newEvents.push({
        type: 'rate_change',
        at: now.toISOString(),
        from: currentRate,
        to: detailFields.interestRate,
      });
      detailUpdates.interestRate = detailFields.interestRate.toFixed(4);
    }
  }

  if (detailFields.termMonths !== undefined && detailFields.termMonths !== loan.termMonths) {
    newEvents.push({
      type: 'term_change',
      at: now.toISOString(),
      from: loan.termMonths ?? 0,
      to: detailFields.termMonths ?? 0,
    });
    detailUpdates.termMonths = detailFields.termMonths;
  }

  if (detailFields.plannedPayment !== undefined) {
    const currentCents = loan.plannedPayment === null ? null : loan.plannedPayment.toCents();
    const nextCents = detailFields.plannedPayment === null ? null : detailFields.plannedPayment.toCents();
    if (currentCents !== nextCents) {
      newEvents.push({
        type: 'planned_payment_change',
        at: now.toISOString(),
        fromCents: currentCents ?? 0,
        toCents: nextCents ?? 0,
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

  if (newEvents.length > 0) {
    detailUpdates.events = [...(loan.events ?? []), ...newEvents];
  }

  if (Object.keys(detailUpdates).length > 0) {
    await loan.update(detailUpdates);
  }

  if (name !== undefined || currentBalance !== undefined) {
    const accountUpdates: Record<string, unknown> = {};
    if (name !== undefined) accountUpdates.name = name;
    if (currentBalance !== undefined) {
      // API takes a positive outstanding amount; loan accounts persist it as a
      // negative ledger balance so net worth aggregation includes liabilities.
      const negative = currentBalance.negate();
      accountUpdates.currentBalance = negative;
      accountUpdates.refCurrentBalance = await calculateRefAmount({
        userId,
        amount: negative,
        baseCode: loan.account.currencyCode,
        date: now,
      });
    }
    await Accounts.update(accountUpdates, { where: { id: accountId, userId } });
  }

  return loan.reload({ include: [{ model: Accounts, as: 'account' }] });
};

export const updateLoan = withTransaction(updateLoanImpl);
