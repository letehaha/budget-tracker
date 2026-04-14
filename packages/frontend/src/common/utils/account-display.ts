import { ACCOUNT_STATUSES, AccountModel } from '@bt/shared/types';

export const isAccountArchived = (account: Pick<AccountModel, 'status'> & { _isOutOfWallet?: boolean }): boolean =>
  !account._isOutOfWallet && account.status === ACCOUNT_STATUSES.archived;

export const getAccountDisplayLabel = (account: AccountModel): string =>
  isAccountArchived(account) ? `${account.name} (archived)` : account.name;
