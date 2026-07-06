import type { VehicleModel } from '@/api/vehicles';
import { ACCOUNT_CATEGORIES, type AccountWithRelinkStatus, type RecordId } from '@bt/shared/types';

/**
 * True only for a genuine orphan: a vehicle-category account still in the live
 * list but missing its vehicle record. A ghost id (already dropped from the live
 * list, e.g. a just-deleted vehicle) legitimately has no record and returns false.
 */
export const isGenuineVehicleOrphan = ({
  accountId,
  liveAccounts,
  vehicles,
}: {
  accountId: RecordId | undefined;
  liveAccounts: Pick<AccountWithRelinkStatus, 'id' | 'accountCategory'>[];
  vehicles: Pick<VehicleModel, 'accountId'>[];
}): boolean => {
  if (!accountId) return false;
  const account = liveAccounts.find((item) => item.id === accountId);
  if (!account) return false;
  if (account.accountCategory !== ACCOUNT_CATEGORIES.vehicle) return false;
  return !vehicles.some((vehicle) => vehicle.accountId === accountId);
};
