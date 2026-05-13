import { ACCOUNT_STATUSES, AccountModel } from '@bt/shared/types';

const MAX_OWNER_USERNAME_DISPLAY_CHARS = 12;

export const isAccountArchived = (account: Pick<AccountModel, 'status'> & { _isOutOfWallet?: boolean }): boolean =>
  !account._isOutOfWallet && account.status === ACCOUNT_STATUSES.archived;

/**
 * Trim an owner username for inline display. Used by both the account-list label and any
 * other "owned by @{user}" hints — keep them in lockstep so the same person reads the
 * same handle everywhere.
 */
export const truncateOwnerUsername = (username: string): string =>
  username.length > MAX_OWNER_USERNAME_DISPLAY_CHARS
    ? `${username.slice(0, MAX_OWNER_USERNAME_DISPLAY_CHARS)}…`
    : username;

export const getAccountDisplayLabel = (account: AccountModel): string => {
  const archivedSuffix = isAccountArchived(account) ? ' (archived)' : '';
  // Append a "(shared by @owner)" hint when the caller is a recipient on this account, so
  // dropdowns make ownership obvious without extra UI. Owner-side `share` blocks (where
  // `isOwner` is true) are silent — the caller IS the owner, no point telling them.
  const sharedSuffix =
    account.share && !account.share.isOwner
      ? ` (shared by @${truncateOwnerUsername(account.share.owner.username)})`
      : '';
  return `${account.name}${archivedSuffix}${sharedSuffix}`;
};
