import type { SharePermission, SharePolicy } from '@bt/shared/types';
import { ACCESS_SOURCES, RESOURCE_TYPES } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import Accounts from '@models/accounts.model';
import ResourceShares from '@models/resource-shares.model';
import { Op } from '@sequelize/core';

import {
  SHARE_SOURCE_PRIORITY,
  type ShareSource,
  type ShareableResource,
  buildPerResourceSource,
} from '../share-context-resolver';
import { toPositiveInt } from '../sharing-utils';

/**
 * Per-resource share source: explicit `ResourceShares` row of type `account`. Most
 * specific grant, so highest priority — wins over a household membership when both
 * apply to the same account (matches `canUserAccessResource` precedence).
 */
const accountPerResourceSource = buildPerResourceSource<Accounts>({
  resourceType: RESOURCE_TYPES.account,
});

/**
 * Household-membership source: an accepted `household` ResourceShares row grants the
 * caller access to every account owned by the grantor. `resourceId` on a household
 * row encodes the grantor's user id (DB CHECK constraint enforces shape), so we
 * pull all accounts whose `userId` matches a household-grantor user id.
 */
const accountHouseholdSource: ShareSource<Accounts> = {
  priority: SHARE_SOURCE_PRIORITY.household,
  async resolve(userId) {
    const shares = await ResourceShares.findAll({
      where: {
        sharedWithUserId: userId,
        resourceType: RESOURCE_TYPES.household,
        acceptedAt: { [Op.not]: null },
      },
    });
    if (!shares.length) return null;

    const sharesByGrantorId = new Map<number, { permission: SharePermission; policy: SharePolicy | null }>();
    const grantorIds: number[] = [];
    for (const share of shares) {
      const grantorId = toPositiveInt(share.resourceId);
      if (grantorId === null) {
        // Household resourceId is the grantor user id (CHECK constraint enforces shape).
        // A non-numeric value implies a write-path bypass — log + drop.
        logger.error(
          {
            message: 'Household share row has non-numeric resourceId',
            error: new Error(`resourceId=${JSON.stringify(share.resourceId)}`),
          },
          {
            code: 'SHARED_HOUSEHOLD_INVALID_RESOURCE_ID',
            shareId: share.id,
            userId,
            resourceId: share.resourceId,
          },
        );
        continue;
      }
      sharesByGrantorId.set(grantorId, { permission: share.permission, policy: share.policy });
      grantorIds.push(grantorId);
    }
    if (!grantorIds.length) return null;

    return {
      where: { userId: { [Op.in]: grantorIds } },
      contextFor: (row) => {
        const share = sharesByGrantorId.get(row.userId);
        if (!share) return null;
        return {
          permission: share.permission,
          policy: share.policy,
          accessSource: ACCESS_SOURCES.household,
        };
      },
    };
  },
};

export const accountShareable: ShareableResource<Accounts> = {
  model: Accounts,
  resourceType: RESOURCE_TYPES.account,
  sources: [accountPerResourceSource, accountHouseholdSource],
};
