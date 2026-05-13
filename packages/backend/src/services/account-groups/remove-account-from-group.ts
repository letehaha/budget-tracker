import { RESOURCE_TYPES, SHARE_PERMISSIONS } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import AccountGrouping from '@models/accounts-groups/account-grouping.model';
import AccountGroup from '@models/accounts-groups/account-groups.model';
import { canUserAccessResource } from '@services/sharing/auth/can-user-access-resource.service';

import { withTransaction } from '../common/with-transaction';

export const removeAccountFromGroup = withTransaction(
  async ({ accountIds, groupId, userId }: { accountIds: number[]; groupId: number; userId: number }): Promise<void> => {
    // Group must belong to the caller; this is also the authorization gate for the
    // destroy below — by scoping the `AccountGrouping` row deletion to a caller-owned
    // `groupId`, we cannot touch another user's grouping rows even when `accountId`
    // points at a shared resource.
    await findOrThrowNotFound({
      query: AccountGroup.findOne({ where: { id: groupId, userId } }),
      message: t({ key: 'accountGroups.accountGroupNotFound' }),
    });

    // Caller must at least be able to read each account to manage their own grouping for
    // it (owner or accepted-share recipient at any permission level).
    await Promise.all(
      accountIds.map(async (accountId) => {
        const access = await canUserAccessResource({
          userId,
          resourceType: RESOURCE_TYPES.account,
          resourceId: accountId,
          requiredPermission: SHARE_PERMISSIONS.read,
        });
        if (!access.granted) {
          throw new NotFoundError({
            message: `Accounts with ids ${accountId} do not exist`,
          });
        }
      }),
    );

    await AccountGrouping.destroy({
      where: {
        accountId: accountIds,
        groupId,
      },
    });
  },
);
