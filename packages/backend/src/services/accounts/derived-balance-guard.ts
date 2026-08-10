import { type ACCOUNT_CATEGORIES, isDedicatedFlowAccountCategory } from '@bt/shared/types';
import { ValidationError } from '@js/errors';

/**
 * Vehicle and loan balances are derived by their dedicated flows (depreciation
 * model / loan events), not built from transactions; importing rows into such an
 * account, shifting its balance, or handing it to a bank connection desyncs the
 * managed anchor exactly as a raw `currentBalance` write in `updateAccount`
 * would. UIs filter these categories out of the relevant pickers, so this guard
 * only fires on crafted payloads.
 *
 * `actionPhrase` completes the sentence "…account and cannot <actionPhrase>." so
 * each caller keeps its own wording (e.g. "be an import target", "take a balance
 * adjustment").
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
