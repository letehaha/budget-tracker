import { RESOURCE_TYPES } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import Accounts from '@models/accounts.model';
import ResourceShares from '@models/resource-shares.model';
import { Op } from 'sequelize';

import { toPositiveInt } from '../sharing-utils';

/**
 * Returns the union of account ids the user has read access to:
 *   - their owned accounts
 *   - accounts shared with them via an accepted per-resource `ResourceShares` row
 *   - every account owned by a user who has granted them an accepted household
 *     `ResourceShares` row
 *
 * Used by the public transactions read-path to scope visibility (creator-id is no longer
 * the right filter once an account can have multiple users contributing transactions).
 *
 * Returns deduplicated, sorted ascending so callers can rely on a stable order if they
 * cache or compare the array.
 */
export const getAccessibleAccountIdsForUser = async ({ userId }: { userId: number }): Promise<string[]> => {
  const [ownedRows, perResourceRows, householdRows] = await Promise.all([
    Accounts.findAll({
      where: { userId },
      attributes: ['id'],
      raw: true,
    }) as unknown as Promise<{ id: string }[]>,
    ResourceShares.findAll({
      where: {
        sharedWithUserId: userId,
        resourceType: RESOURCE_TYPES.account,
        acceptedAt: { [Op.not]: null },
      },
      attributes: ['resourceId'],
      raw: true,
    }) as unknown as Promise<{ resourceId: string }[]>,
    ResourceShares.findAll({
      where: {
        sharedWithUserId: userId,
        resourceType: RESOURCE_TYPES.household,
        acceptedAt: { [Op.not]: null },
      },
      attributes: ['resourceId'],
      raw: true,
    }) as unknown as Promise<{ resourceId: string }[]>,
  ]);

  const ids = new Set<string>();
  for (const row of ownedRows) ids.add(row.id);
  for (const row of perResourceRows) {
    if (row.resourceId) {
      ids.add(row.resourceId);
    }
  }

  const grantorUserIds: number[] = [];
  for (const row of householdRows) {
    const numeric = toPositiveInt(row.resourceId);
    if (numeric !== null) {
      grantorUserIds.push(numeric);
    } else {
      logger.error(
        {
          message: 'Household share row has non-numeric resourceId',
          error: new Error(`resourceId=${JSON.stringify(row.resourceId)}`),
        },
        { code: 'SHARED_HOUSEHOLD_INVALID_RESOURCE_ID', userId, resourceId: row.resourceId },
      );
    }
  }
  if (grantorUserIds.length) {
    const grantorAccounts = (await Accounts.findAll({
      where: { userId: { [Op.in]: grantorUserIds } },
      attributes: ['id'],
      raw: true,
    })) as unknown as { id: string }[];
    for (const row of grantorAccounts) ids.add(row.id);
  }

  return Array.from(ids).toSorted();
};
