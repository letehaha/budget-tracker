import type { LoanProjection } from '@bt/shared/types';
import { computeLoanProjection } from '@common/loans/projection';
import type Accounts from '@models/accounts.model';
import type LoanDetails from '@models/loan-details.model';

// Adapter: feeds LoanDetails + Accounts into computeLoanProjection, keeping that
// module free of Sequelize types. currentBalance is stored negative (liability
// convention); the projection module wants a positive outstanding balance.
export function projectLoan({
  loanDetails,
  account,
  today,
}: {
  loanDetails: LoanDetails;
  account: Accounts;
  today: Date;
}): LoanProjection {
  // The stored balance is negative (liability) and floored at zero upstream, so
  // negating yields the positive outstanding the projection wants. Floor at zero
  // rather than abs: abs would render a stray credit as an equal amount of debt.
  const currentBalanceCents = Math.max(0, -account.currentBalance.toCents());
  const plannedPaymentMoney = loanDetails.plannedPayment;

  return computeLoanProjection({
    currentBalanceCents,
    originalPrincipalCents: loanDetails.originalPrincipal.toCents(),
    interestRate: loanDetails.interestRate,
    plannedPaymentCents: plannedPaymentMoney === null ? null : plannedPaymentMoney.toCents(),
    termMonths: loanDetails.termMonths,
    today,
  });
}
