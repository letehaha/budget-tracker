import {
  ACCOUNT_CATEGORIES,
  API_ERROR_CODES,
  type LoanPaymentOverpayDetails,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import { Money } from '@common/types/money';
import { t } from '@i18n/index';
import { NotFoundError, ValidationError } from '@js/errors';
import Accounts from '@models/accounts.model';
import { namespace } from '@models/connection';
import LoanDetails from '@models/loan-details.model';
import Transactions from '@models/transactions.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { withTransaction } from '@services/common/with-transaction';
import { updateTransaction } from '@services/transactions/update-transaction';
import { format } from 'date-fns';

interface LinkLoanPaymentsParams {
  userId: number;
  /** The loan's underlying Account id. */
  accountId: string;
  transactionIds: string[];
  /**
   * A batch overshooting the owed balance first fails with a confirmation-required
   * error; re-sending with this flag proceeds (FX rounding can land a few cents over).
   */
  confirmOverpay?: boolean;
}

/**
 * Bulk-link existing expense transactions to a loan as payments: each expense
 * becomes the source leg of a transfer-to-loan with a matching income leg on
 * the loan account (same path the single-transaction edit dialog uses). Unlike
 * the per-payment guard, overpay is validated once for the whole batch against
 * the row-locked balance, and is confirmable rather than a hard block.
 */
const linkLoanPaymentsImpl = async ({
  userId,
  accountId,
  transactionIds,
  confirmOverpay = false,
}: LinkLoanPaymentsParams) => {
  const sequelizeTx = namespace.get('transaction');

  // Row-lock the loan account so concurrent payment writes serialise against
  // this batch's balance read (same invariant as `assertLoanPaymentAllowed`).
  const loanAccount = await Accounts.findOne({
    where: { id: accountId, userId },
    transaction: sequelizeTx,
    lock: sequelizeTx?.LOCK.UPDATE,
  });
  if (!loanAccount || loanAccount.accountCategory !== ACCOUNT_CATEGORIES.loan) {
    throw new NotFoundError({ message: t({ key: 'loans.loanNotFound' }) });
  }

  const loanDetails = await LoanDetails.findOne({
    where: { accountId, userId },
    attributes: ['balanceAnchorDate'],
  });
  if (!loanDetails) {
    throw new NotFoundError({ message: t({ key: 'loans.loanNotFound' }) });
  }
  const anchorDate = loanDetails.balanceAnchorDate;
  const loanCurrencyCode = loanAccount.currencyCode;

  const transactions = await Transactions.findAll({ where: { id: transactionIds, userId } });
  if (transactions.length !== new Set(transactionIds).size) {
    // Stale or tampered selection — fail the whole batch rather than silently link a subset.
    throw new ValidationError({ message: t({ key: 'loans.linkPaymentsInvalidSelection' }) });
  }

  // Validate eligibility and pre-compute each loan-side amount before any write,
  // so an ineligible row aborts the batch atomically.
  const plans = await Promise.all(
    transactions.map(async (tx) => {
      const isEligible =
        tx.transferNature === TRANSACTION_TRANSFER_NATURE.not_transfer &&
        tx.transactionType === TRANSACTION_TYPES.expense &&
        tx.accountId !== accountId;
      if (!isEligible) {
        throw new ValidationError({ message: t({ key: 'loans.linkPaymentsInvalidSelection' }) });
      }

      // Loan-side (income) amount in the loan's currency, converted at the
      // payment's own date. Same-currency returns the amount unchanged.
      const destinationAmount = await calculateRefAmount({
        userId,
        amount: tx.amount,
        baseCode: tx.currencyCode,
        quoteCode: loanCurrencyCode,
        date: tx.time,
      });

      // Only payments dated on/after the anchor move the balance; the recompute
      // ignores earlier legs, so they're excluded from the overpay projection too.
      const countsTowardBalance = format(new Date(tx.time), 'yyyy-MM-dd') >= anchorDate;

      return { txId: tx.id, destinationAmount, countsTowardBalance };
    }),
  );

  const postAnchorSum = plans
    .filter((plan) => plan.countsTowardBalance)
    .reduce((sum, plan) => sum.add(plan.destinationAmount), Money.zero());

  // Loan balances are negative (liability); income legs add toward zero. A
  // positive projection means the batch overshoots the owed amount.
  const projectedBalance = loanAccount.currentBalance.add(postAnchorSum);
  if (projectedBalance.toCents() > 0 && !confirmOverpay) {
    const details: LoanPaymentOverpayDetails = {
      projectedBalance: projectedBalance.toNumber(),
      maxLinkable: loanAccount.currentBalance.abs().toNumber(),
      overpayBy: projectedBalance.toNumber(),
    };
    throw new ValidationError({
      code: API_ERROR_CODES.loanPaymentOverpayConfirmationRequired,
      message: t({ key: 'loans.linkPaymentsOverpayConfirmation' }),
      details,
    });
  }

  // Convert each expense into a transfer-to-loan. `skipLoanOverpayAssert` hands
  // overpay authority to the aggregate check above; the per-leg guard would
  // otherwise reject as each linked leg moves the balance toward zero.
  for (const plan of plans) {
    await updateTransaction({
      id: plan.txId,
      userId,
      transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
      destinationAccountId: accountId,
      destinationAmount: plan.destinationAmount,
      skipLoanOverpayAssert: true,
    });
  }

  return { linkedCount: plans.length };
};

export const linkLoanPayments = withTransaction(linkLoanPaymentsImpl);
