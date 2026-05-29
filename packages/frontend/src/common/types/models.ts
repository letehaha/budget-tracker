import { AccountModel, UserModel } from '@bt/shared/types';

export interface AccountGroups {
  id: string;
  userId: number;
  name: string;
  parentGroupId: string | null;
  bankDataProviderConnectionId: string | null;
  user: UserModel;
  parentGroup: AccountGroups;
  childGroups: AccountGroups[];
  accounts: AccountModel[];
}
