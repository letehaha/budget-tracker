import { ACCOUNT_CATEGORIES } from '@bt/shared/types';
import type { Money } from '@common/types/money';
import { t } from '@i18n/index';
import { NotFoundError, ValidationError } from '@js/errors';
import Accounts from '@models/accounts.model';
import { namespace } from '@models/connection';

/**
 * Row-locked validation that a loan payment (the income leg landing on a
 * loan-category account) keeps the loan within its outstanding balance.
 * Single home for the "institutional loans can't go into credit" invariant —
 * both the transaction create path (`createOppositeTransaction`) and the
 * edit path (`updateTransaction`'s validation) delegate here.
 *
 * SELECT ... FOR UPDATE on the loan account row: two concurrent payment
 * writes would otherwise each read the same pre-payment balance, each pass
 * the projected-balance check, and together push the loan into a positive
 * (overpaid) state. The row lock serialises them on the same Postgres
 * transaction so the second write sees the first one's update.
 *
 * Loan balances are stored as negative cents (liability convention); the
 * income leg adds toward zero. A positive projected balance means the
 * payment overshoots the remaining owed, so the write is rejected.
 */
export const assertLoanPaymentAllowed = async ({
  ownerUserId,
  loanAccountId,
  newLegAmount,
  currentLegAmount = null,
}: {
  ownerUserId: number;
  loanAccountId: string;
  /** Income-leg amount (in the loan account's currency) after the write lands. */
  newLegAmount: Money;
  /**
   * Amount of an existing income leg already reflected in THIS account's
   * balance that the write replaces. Must stay `null` when the payment is
   * being re-pointed from a different account — the old leg never touched
   * this account's balance, so backing it out here would understate the
   * projection and let an overpay through.
   */
  currentLegAmount?: Money | null;
}): Promise<void> => {
  const sequelizeTx = namespace.get('transaction');
  const loanAccount = await Accounts.findOne({
    where: { id: loanAccountId, userId: ownerUserId },
    transaction: sequelizeTx,
    lock: sequelizeTx?.LOCK.UPDATE,
  });
  if (!loanAccount) {
    throw new NotFoundError({ message: t({ key: 'accounts.accountNotFoundForTransaction' }) });
  }
  if (loanAccount.accountCategory !== ACCOUNT_CATEGORIES.loan) {
    throw new ValidationError({
      message: t({ key: 'transactions.transferToLoanRequiresLoanDestination' }),
    });
  }

  let projectedBalance = loanAccount.currentBalance.add(newLegAmount);
  if (currentLegAmount !== null) {
    projectedBalance = projectedBalance.subtract(currentLegAmount);
  }
  if (projectedBalance.toCents() > 0) {
    throw new ValidationError({
      message: t({ key: 'transactions.loanPaymentOverpay' }),
    });
  }
};
