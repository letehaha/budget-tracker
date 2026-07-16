import { type ACCOUNT_CATEGORIES, isDedicatedFlowAccountCategory } from '@bt/shared/types';
import { ValidationError } from '@js/errors';

/**
 * Vehicle and loan balances are owned by their dedicated flows (depreciation
 * model / loan events); importing rows into such an account, or shifting its
 * balance directly, desyncs the managed anchor exactly as a raw `currentBalance`
 * write in `updateAccount` would. The import UI filters these categories out of
 * the link-target list, so this guard only fires on crafted payloads.
 *
 * `actionPhrase` completes the sentence "…account and cannot <actionPhrase>." so
 * each caller keeps its own wording (e.g. "be an import target", "take a balance
 * adjustment").
 */
export function assertNotDedicatedFlowAccount({
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
