import type { RecordId } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import AccountGroup from '@models/accounts-groups/account-groups.model';

import { withTransaction } from '../common/with-transaction';

export const createAccountGroup = withTransaction(
  async ({
    userId,
    name,
    parentGroupId,
  }: {
    userId: number;
    name: string;
    parentGroupId?: RecordId | null;
  }): Promise<AccountGroup> => {
    if (parentGroupId) {
      await findOrThrowNotFound({
        query: AccountGroup.findOne({ where: { id: parentGroupId, userId } }),
        message: t({ key: 'accountGroups.parentGroupDoesNotExist' }),
      });
    }

    return AccountGroup.create({ userId, name, parentGroupId });
  },
);
