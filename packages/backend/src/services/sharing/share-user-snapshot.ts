import Users from '@models/users.model';

/**
 * Minimal user descriptor embedded into share-related responses and notification payloads.
 * Always includes a stable `id` (or the supplied fallback when the source row is missing)
 * plus the display fields the frontend renders without dereferencing the id.
 */
export interface ShareUserSnapshot {
  id: number;
  username: string;
  avatar: string | null;
}

/**
 * Sentinel id used when a user row is missing — see callers in `share-notifications.ts`
 * (recipient/owner row deleted between events). Pass it as `fallbackId` to flag the
 * snapshot as a "user gone" marker the frontend renders without a lookup.
 */
export const SHARE_SNAPSHOT_MISSING_USER_ID = 0;

export const snapshotShareUser = (user: Users | null | undefined, fallbackId: number): ShareUserSnapshot => ({
  id: user?.id ?? fallbackId,
  username: user?.username ?? 'Unknown user',
  avatar: user?.avatar ?? null,
});

/** Fallback display name used in user-facing email copy when the owner's row is unreadable. */
export const FALLBACK_OWNER_DISPLAY_NAME = 'A MoneyMatter user';
