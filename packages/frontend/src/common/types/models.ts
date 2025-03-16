import { AccountModel, UserModel } from '@bt/shared/types';

export interface AccountGroups {
  id: number;
  userId: number;
  name: string;
  parentGroupId: number | null;
  user: UserModel;
  parentGroup: AccountGroups;
  childGroups: AccountGroups[];
  accounts: AccountModel[];
}
