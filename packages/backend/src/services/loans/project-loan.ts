import type { LoanProjection } from '@bt/shared/types';
import { computeLoanProjection } from '@common/loans/projection';
import type Accounts from '@models/accounts.model';
import type LoanDetails from '@models/loan-details.model';

/**
 * Adapter: feeds a `LoanDetails` + its parent `Accounts` into the pure
 * projection function. Lives in the services layer so the projection module
 * can stay free of Sequelize types and remain trivially unit-testable.
 *
 * Loan account balances are stored negative in `Account.currentBalance` (the
 * accounting-convention sign used everywhere for liabilities). The projection
 * module expects an outstanding-balance positive integer, so the adapter
 * takes the absolute value here before handing off.
 */
export function projectLoan({
  loanDetails,
  account,
  today,
}: {
  loanDetails: LoanDetails;
  account: Accounts;
  today: Date;
}): LoanProjection {
  const currentBalanceCents = Math.abs(account.currentBalance.toCents());
  const plannedPaymentMoney = loanDetails.plannedPayment;

  return computeLoanProjection({
    currentBalanceCents,
    originalPrincipalCents: loanDetails.originalPrincipal.toCents(),
    interestRate: loanDetails.interestRate,
    plannedPaymentCents: plannedPaymentMoney === null ? null : plannedPaymentMoney.toCents(),
    today,
  });
}
