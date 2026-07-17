import { Money } from '@common/types/money';

/**
 * Fold a written transaction row into its signed balance contribution, matching
 * the sign the balance hook applied when the row was created: income adds,
 * expense subtracts. Only the account-currency amount is tallied — the ref
 * balances are derived measures (spot for the current balance, boundary-rate for
 * the opening balance), maintained by the balance hooks themselves rather than
 * reconstructed from per-row sums.
 */
export function signedRowContribution({ isIncome, amount }: { isIncome: boolean; amount: Money }): {
  signedAmount: Money;
} {
  return isIncome ? { signedAmount: amount } : { signedAmount: amount.negate() };
}
