import { AccountGroupApiResponse, AccountModel } from '@bt/shared/types';

/**
 * Account groups as `GET /account-group` returns them. Nested accounts are typed
 * as `AccountModel` – the shape the rest of the client reads accounts through –
 * instead of the serializer's stringly-typed `AccountApiResponse`.
 */
export type AccountGroups = Omit<AccountGroupApiResponse, 'accounts' | 'childGroups'> & {
  accounts: AccountModel[];
  childGroups: AccountGroups[];
};
