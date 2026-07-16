import { Money } from '@common/types/money';

/**
 * Fold a written transaction row into its signed balance contribution, matching
 * the sign the balance hook applied when the row was created: income adds,
 * expense subtracts. The SAME sign is applied to both the account-currency
 * `amount` and the base-currency `refAmount`, so the ref tally carries the
 * row-date FX rate the hook used — never a today-rate reconversion of `amount`,
 * which would leave `refCurrentBalance` off by the FX drift.
 */
export function signedRowContribution({
  isIncome,
  amount,
  refAmount,
}: {
  isIncome: boolean;
  amount: Money;
  refAmount: Money;
}): { signedAmount: Money; signedRefAmount: Money } {
  return isIncome
    ? { signedAmount: amount, signedRefAmount: refAmount }
    : { signedAmount: amount.negate(), signedRefAmount: refAmount.negate() };
}
