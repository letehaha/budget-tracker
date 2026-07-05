/** The balance fields the credit-limit display adjustment reads. */
export interface CreditLimitBalanceInput {
  currentBalance: number;
  refCurrentBalance: number;
  creditLimit: number;
  /** When true, an account carrying a credit limit shows its balance net of that limit. */
  includeCreditLimit: boolean;
}

export interface AccountDisplayBalances {
  hasCreditLimitAdjustment: boolean;
  /** Balance in the account's own currency, net of the credit limit when adjusting. */
  displayBalance: number;
  /** Balance in the user's base currency, net of the credit limit when adjusting. */
  displayRefBalance: number;
}

/**
 * Credit-limit-adjusted balances for an account, in both its own and the base currency.
 * The single source for this rule so the per-row display (`useAccountDisplayBalance`) and
 * the sidebar group roll-ups (`sumAccountsBaseBalance`) can't drift out of sync.
 */
export const computeAccountDisplayBalances = ({
  currentBalance,
  refCurrentBalance,
  creditLimit,
  includeCreditLimit,
}: CreditLimitBalanceInput): AccountDisplayBalances => {
  const hasCreditLimitAdjustment = includeCreditLimit && creditLimit > 0;
  if (!hasCreditLimitAdjustment) {
    return { hasCreditLimitAdjustment, displayBalance: currentBalance, displayRefBalance: refCurrentBalance };
  }

  const displayBalance = currentBalance - creditLimit;
  // Scale the base-currency balance by the same ratio the own-currency balance is adjusted,
  // so the reduction survives FX without a separate refCreditLimit rate. Guard the zero case.
  const displayRefBalance = currentBalance === 0 ? 0 : displayBalance * (refCurrentBalance / currentBalance);

  return { hasCreditLimitAdjustment, displayBalance, displayRefBalance };
};
