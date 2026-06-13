// Float fuzz at the cent boundary — the backend compares cents, the frontend
// compares decimals. 0.005 ≈ half a cent, enough slack to keep an exact payoff
// valid without letting a real overpay through.
const OVERPAY_CENT_SLACK = 0.005;

/**
 * Largest payment that still leaves the loan at or above a zero balance, in the
 * loan's currency as a positive decimal.
 *
 * `loanCurrentBalance` is the loan account's signed balance — liabilities are
 * stored negative, so the magnitude is what's still owed. `existingLegAmount`
 * credits back a payment already applied to this loan when editing it, so
 * re-saving the same amount (or a smaller one) doesn't trip the overpay guard.
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
