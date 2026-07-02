// Half-cent slack: backend compares cents, frontend compares decimals — keeps
// an exact payoff valid without letting a real overpay through.
const OVERPAY_CENT_SLACK = 0.005;

/**
 * Max payment that keeps the loan at/above zero, as a positive decimal.
 * `loanCurrentBalance` is signed (liabilities negative); `existingLegAmount`
 * credits back an already-applied payment so editing it doesn't false-trip the guard.
 */
export const getMaxLoanPayment = ({
  loanCurrentBalance,
  existingLegAmount = 0,
}: {
  loanCurrentBalance: number;
  existingLegAmount?: number;
}): number => Math.abs(loanCurrentBalance) + existingLegAmount;

/**
 * True when `amount` would push the loan past a zero balance — i.e. pay off
 * more than is owed — beyond a half-cent of float slack.
 */
export const isLoanOverpayment = ({ amount, maxPayment }: { amount: number; maxPayment: number }): boolean =>
  Number.isFinite(amount) && amount > maxPayment + OVERPAY_CENT_SLACK;
