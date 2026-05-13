import { RESOURCE_TYPES, SHARE_PERMISSIONS } from '@bt/shared/types';
import { NotFoundError, ValidationError } from '@js/errors';
import * as Categories from '@models/categories.model';
import { canUserAccessResource } from '@services/sharing/auth/can-user-access-resource.service';
import { getAccessibleCategoryOwnerIds } from '@services/sharing/auth/get-accessible-category-owner-ids.service';

import { withTransaction } from './common/with-transaction';

export const bulkCreate = withTransaction(
  (
    { data }: { data: unknown },
    {
      validate,
      returning,
    }: {
      validate?: boolean;
      returning?: boolean;
    } = {},
  ) => {
    return Categories.bulkCreate({ data }, { validate, returning });
  },
);

/**
 * Returns categories scoped to the caller, with two exceptions:
 *
 *  1. `accountId` is provided — return the *account owner's* category set so the
 *     recipient can categorize transactions on a shared account using the owner's tree
 *     (`family-sharing-categories.md`). Owned accounts behave like the no-arg path.
 *  2. `includeAccessible: true` — return the union of the caller's categories plus all
 *     categories belonging to owners of accounts the caller has read access to. Used by
 *     read-only display paths (transaction lists, dashboard widgets) so a single fetch
 *     populates the global lookup map for both own and shared-account txs. Without this,
 *     each shared-account tx would need a per-owner round-trip just to render its name.
 *
 * Stranger `accountId` returns 404 to keep the param from leaking other users' resources.
 * `accountId` and `includeAccessible` are mutually exclusive — caller must pick one.
 */
export const getCategories = withTransaction(
  async (payload: { userId: number; accountId?: number; includeAccessible?: boolean }) => {
    const { userId, accountId, includeAccessible } = payload;

    if (accountId !== undefined && includeAccessible) {
      throw new ValidationError({ message: '`accountId` and `includeAccessible` cannot be combined.' });
    }

    if (accountId) {
      const access = await canUserAccessResource({
        userId,
        resourceType: RESOURCE_TYPES.account,
        resourceId: accountId,
        requiredPermission: SHARE_PERMISSIONS.read,
      });
      if (!access.granted) {
        throw new NotFoundError({ message: 'Account not found.' });
      }
      const scopedUserId = access.isOwner ? userId : access.ownerUserId!;
      return Categories.getCategories({ userId: scopedUserId });
    }

    if (includeAccessible) {
      const ownerUserIds = await getAccessibleCategoryOwnerIds({ userId });
      return Categories.getCategoriesForUsers({ userIds: ownerUserIds });
    }

    return Categories.getCategories({ userId });
  },
);
