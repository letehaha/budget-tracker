import { type ACCOUNT_CATEGORIES, isDedicatedFlowAccountCategory } from '@bt/shared/types';
import { ValidationError } from '@js/errors';

/**
 * Vehicle and loan balances are derived by their dedicated flows (depreciation
 * model / loan events), not built from transactions; importing rows, shifting
 * the balance, or linking a bank connection desyncs the managed anchor. UIs
 * filter these categories out of the pickers, so this guard only fires on
 * crafted payloads.
 *
 * `actionPhrase` completes the sentence "…account and cannot <actionPhrase>."
 */
export function assertNotDerivedBalanceAccount({
  account,
  actionPhrase,
}: {
  account: { name: string; accountCategory: ACCOUNT_CATEGORIES };
  actionPhrase: string;
}): void {
  if (isDedicatedFlowAccountCategory(account.accountCategory)) {
    throw new ValidationError({
      message: `Account "${account.name}" is a ${account.accountCategory} account and cannot ${actionPhrase}.`,
    });
  }
}
