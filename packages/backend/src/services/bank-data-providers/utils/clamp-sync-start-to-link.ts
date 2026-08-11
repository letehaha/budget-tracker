import type { AccountExternalData } from '@bt/shared/types';
import type Accounts from '@models/accounts.model';

/**
 * Clamps a sync-window start to `bankConnection.linkedAt`: forward-only
 * linking. A window anchored at the newest row can reach back to a manual
 * entry whose bank-side copy has no `originalId` for dedup to match and would
 * re-import as a duplicate. Pre-link history belongs to the link residual
 * absorb, never to the statement import. Without linking metadata (accounts
 * created directly from the provider), `from` passes through unchanged.
 */
export function clampSyncStartToLink({ account, from }: { account: Accounts; from: Date }): Date {
  const linkedAtIso = (account.externalData as AccountExternalData | null)?.bankConnection?.linkedAt;
  if (!linkedAtIso) return from;

  const linkedAt = new Date(linkedAtIso);
  if (Number.isNaN(linkedAt.getTime())) return from;

  return linkedAt > from ? linkedAt : from;
}
