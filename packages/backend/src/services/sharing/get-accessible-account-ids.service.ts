import { RESOURCE_TYPES } from '@bt/shared/types';
import Accounts from '@models/accounts.model';
import ResourceShares from '@models/resource-shares.model';
import { Op } from 'sequelize';

/**
 * Returns the union of account ids the user has read access to: their owned accounts +
 * accounts shared with them via an accepted `ResourceShares` row. Used by the public
 * transactions read-path to scope visibility (creator-id is no longer the right filter
 * once an account can have multiple users contributing transactions).
 *
 * Returns deduplicated, sorted ascending so callers can rely on a stable order if they
 * cache or compare the array.
 */
export const getAccessibleAccountIdsForUser = async ({ userId }: { userId: number }): Promise<number[]> => {
  const [ownedRows, shareRows] = await Promise.all([
    Accounts.findAll({
      where: { userId },
      attributes: ['id'],
      raw: true,
    }) as unknown as Promise<{ id: number }[]>,
    ResourceShares.findAll({
      where: {
        sharedWithUserId: userId,
        resourceType: RESOURCE_TYPES.account,
        acceptedAt: { [Op.not]: null },
      },
      attributes: ['resourceId'],
      raw: true,
    }) as unknown as Promise<{ resourceId: string }[]>,
  ]);

  const ids = new Set<number>();
  for (const row of ownedRows) ids.add(row.id);
  for (const row of shareRows) {
    const numeric = Number(row.resourceId);
    if (Number.isInteger(numeric) && numeric > 0) ids.add(numeric);
  }
  return Array.from(ids).toSorted((a, b) => a - b);
};
