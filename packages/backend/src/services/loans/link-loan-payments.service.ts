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
   * When the post-anchor payments would push the loan past its owed balance,
   * the service first refuses with a confirmation-required error. The caller
   * re-sends with this flag to proceed anyway (small FX-rounding overshoots
   * shouldn't block linking real payments).
   */
  confirmOverpay?: boolean;
}

/**
 * Bulk-link existing expense transactions to a loan as payments.
 *
 * Each selected transaction is an ordinary expense on a normal account. Linking
 * converts it into a transfer-to-loan: the expense becomes the source leg and a
 * matching income leg is created on the loan account (the same path the
 * single-transaction edit dialog uses to mark one expense as a loan payment).
 * The loan balance recomputes from its anchor automatically via the model
 * hooks, so payments dated on/after the anchor reduce the outstanding while
 * earlier ones are recorded for history only.
 *
 * Overpay handling differs from the single-payment guard: the whole batch is
 * validated once against the row-locked loan balance, and an overshoot is a
 * confirmable warning rather than a hard block — FX conversion of each leg to
 * the loan currency can land the sum a few cents over the exact owed amount.
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
    // A requested id didn't resolve to one of the user's transactions — the
    // selection is stale or tampered. Fail the whole batch rather than silently
    // linking a subset.
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
