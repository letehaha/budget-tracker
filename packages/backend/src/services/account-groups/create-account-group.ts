import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import AccountGroup from '@models/accounts-groups/AccountGroups.model';

import { withTransaction } from '../common/with-transaction';

export const createAccountGroup = withTransaction(
  async ({
    userId,
    name,
    parentGroupId,
  }: {
    userId: number;
    name: string;
    parentGroupId?: number | null;
  }): Promise<AccountGroup> => {
    if (parentGroupId) {
      const existingParent = await AccountGroup.findByPk(parentGroupId);

      if (!existingParent) {
        throw new NotFoundError({ message: t({ key: 'accountGroups.parentGroupDoesNotExist' }) });
      }
    }

    return AccountGroup.create({ userId, name, parentGroupId });
  },
);
