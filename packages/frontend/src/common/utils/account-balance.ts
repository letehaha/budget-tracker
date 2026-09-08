/** The balance fields the credit-limit display adjustment reads. */
interface CreditLimitBalanceInput {
  currentBalance: number;
  refCurrentBalance: number;
  creditLimit: number;
  refCreditLimit: number;
  /** When true, an account carrying a credit limit shows its balance net of that limit. */
  includeCreditLimit: boolean;
}

interface AccountDisplayBalances {
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
/**
 * Credit drawn on an account, for either the native or the ref balance pair.
 * Provider balances carry the limit inside the balance; a raw manual balance
 * tracks debt directly (0 = untouched card, negative = amount owed).
 */
export const computeCreditUsed = ({
  balance,
  creditLimit,
  balanceIncludesCreditLimit,
}: {
  balance: number;
  creditLimit: number;
  balanceIncludesCreditLimit: boolean;
}): number => Math.max(balanceIncludesCreditLimit ? creditLimit - balance : -balance, 0);

export const computeAccountDisplayBalances = ({
  currentBalance,
  refCurrentBalance,
  creditLimit,
  refCreditLimit,
  includeCreditLimit,
}: CreditLimitBalanceInput): AccountDisplayBalances => {
  const hasCreditLimitAdjustment = includeCreditLimit && creditLimit > 0;
  if (!hasCreditLimitAdjustment) {
    return { hasCreditLimitAdjustment, displayBalance: currentBalance, displayRefBalance: refCurrentBalance };
  }

  return {
    hasCreditLimitAdjustment,
    displayBalance: currentBalance - creditLimit,
    displayRefBalance: refCurrentBalance - refCreditLimit,
  };
};
