import { Money } from '@common/types/money';

/**
 * Fold a written transaction row into its signed balance contribution, matching the
 * sign the balance hook applied when the row was created: income adds, expense
 * subtracts. Only the account-currency amount is tallied — ref balances are derived
 * measures maintained by the balance hooks, not reconstructed from per-row sums.
 */
export function signedRowContribution({ isIncome, amount }: { isIncome: boolean; amount: Money }): {
  signedAmount: Money;
} {
  return isIncome ? { signedAmount: amount } : { signedAmount: amount.negate() };
}
