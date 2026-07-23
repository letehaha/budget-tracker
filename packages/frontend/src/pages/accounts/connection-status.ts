import type { ConnectionStatusSummary } from '@bt/shared/types';

export type ConnectionStatusKind = 'active' | 'expiring-soon' | 'expired' | 'reauth';

/**
 * Collapses the backend consent summary plus the reauth flag into a single
 * badge state. Precedence matters: an expired consent is the hardest failure
 * and outranks a reauth prompt, which in turn outranks a soft "expiring soon"
 * warning; everything else is healthy.
 */
export function deriveConnectionStatus({
  summary,
  needsReauth,
}: {
  summary: ConnectionStatusSummary | undefined;
  needsReauth: boolean;
}): ConnectionStatusKind {
  if (summary?.consentExpired) return 'expired';
  if (needsReauth) return 'reauth';
  if (summary?.consentExpiringSoon) return 'expiring-soon';
  return 'active';
}
