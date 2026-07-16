import { Money } from '@common/types/money';

import type { CreatedAccountInput } from './reconcile-account-balances';

/**
 * The slice of an importer's account-mapping value the partition cares about.
 * Both `AccountMappingValue` (CSV) and `BudgetBakersWalletAccountMappingValue`
 * satisfy it structurally, so each importer passes its own mapping verbatim.
 *
 * Modelled as a discriminated union so `currentBalance` is reachable only on the
 * `create-new` arm — a `link-existing` mapping carries no balance target.
 */
type PartitionableMappingValue =
  | {
      action: 'create-new';
      /**
       * User-entered final balance (decimal, account currency). null/absent
       * means "leave the balance at whatever the imported rows produce".
       */
      currentBalance?: number | null;
    }
  | { action: 'link-existing' };

interface PartitionedReconcileAccounts {
  /**
   * Pre-existing account ids the imported rows will land on, deduplicated —
   * the exact set `startBalanceReconciliation` must snapshot BEFORE any row is
   * written. An account dropped from this set never gets back-adjusted, which
   * permanently shifts its balance with no error.
   */
  capturedAccountIds: string[];
  /** Accounts the import created, shaped for `finalize({ createdAccounts })`. */
  createdAccounts: CreatedAccountInput[];
}

/**
 * Split the resolved accounts of one import run into the two reconciliation
 * populations: pre-existing accounts to capture vs accounts the import created.
 *
 * The split keys off the mapping action, with one non-obvious rule: a name with
 * NO mapping entry is a pre-existing account, not a created one — CSV's
 * "single existing account" flow resolves every (empty) account name through
 * `defaultAccountId` with an empty mapping, and those rows land on a real
 * pre-existing account whose balance must be captured. Deriving the captured
 * set as "action === 'link-existing'" instead would silently drop that flow.
 */
export function partitionReconcileAccounts({
  accountNameToId,
  accountMapping,
}: {
  /** Resolved account id per distinct source account name (`createAccountsIfNeeded` output). */
  accountNameToId: Map<string, string>;
  accountMapping: Record<string, PartitionableMappingValue | undefined>;
}): PartitionedReconcileAccounts {
  const capturedAccountIds = new Set<string>();
  const createdAccounts: CreatedAccountInput[] = [];

  for (const [accountName, accountId] of accountNameToId.entries()) {
    const mapping = accountMapping[accountName];
    if (mapping?.action === 'create-new') {
      createdAccounts.push({
        accountId,
        accountName,
        targetCurrentBalance: mapping.currentBalance != null ? Money.fromDecimal(mapping.currentBalance) : undefined,
      });
    } else {
      capturedAccountIds.add(accountId);
    }
  }

  return { capturedAccountIds: Array.from(capturedAccountIds), createdAccounts };
}
