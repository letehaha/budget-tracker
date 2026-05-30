import { Money } from '@common/types/money';
import { NotFoundError } from '@js/errors';
import { logger } from '@js/utils';
import Accounts from '@models/accounts.model';
import Balances from '@models/balances.model';
import Vehicles from '@models/vehicles.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { withTransaction } from '@services/common/with-transaction';
import { parseISO } from 'date-fns';

import { computeVehicleValue } from './compute-vehicle-value';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface RefreshSingleParams {
  vehicleId: string;
  force?: boolean;
  asOf?: Date;
}

interface RefreshSingleResult {
  value: Money;
  refValue: Money;
  refreshed: boolean;
}

/**
 * Recompute the depreciated value of a vehicle if its cache is stale, and persist
 * the result on the underlying Account row + today's Balances row.
 *
 * Lazy by design — no background cron. Callers (account list, vehicle detail,
 * stats) invoke this; if `valueLastComputedAt` is within 7 days, this returns
 * the cached value cheaply. When `force = true` (e.g. after changing the curve
 * preset), bypasses the cache.
 */
const refreshVehicleValueIfStaleImpl = async ({
  vehicleId,
  force = false,
  asOf,
}: RefreshSingleParams): Promise<RefreshSingleResult> => {
  const vehicle = await Vehicles.findByPk(vehicleId, { include: [{ model: Accounts }] });

  if (!vehicle) {
    throw new NotFoundError({ message: 'Vehicle not found' });
  }

  const account = vehicle.account;
  const now = asOf ?? new Date();

  const cacheValid =
    !force &&
    vehicle.valueLastComputedAt !== null &&
    now.getTime() - new Date(vehicle.valueLastComputedAt).getTime() < CACHE_TTL_MS;

  if (cacheValid) {
    return {
      value: account.currentBalance,
      refValue: account.refCurrentBalance,
      refreshed: false,
    };
  }

  const hasAnchor = vehicle.valueAnchor !== null && vehicle.valueAnchorDate !== null;
  const anchorValue = hasAnchor ? vehicle.valueAnchor! : vehicle.purchasePrice;
  const anchorDateString = hasAnchor ? vehicle.valueAnchorDate! : vehicle.purchaseDate;
  const anchorDate = parseISO(anchorDateString);

  const newValue = computeVehicleValue({
    anchorValue,
    anchorDate,
    asOf: now,
    vehicleClass: vehicle.vehicleClass,
    preset: vehicle.depreciationPreset,
    customAnnualRatePct: vehicle.customAnnualRatePct ? Number(vehicle.customAnnualRatePct) : null,
    salvageFloorPct: Number(vehicle.salvageFloorPct),
  });

  const newRefValue = await calculateRefAmount({
    userId: vehicle.userId,
    amount: newValue,
    baseCode: account.currencyCode,
    date: now,
  });

  await account.update({
    currentBalance: newValue,
    refCurrentBalance: newRefValue,
  });

  await Balances.updateAccountBalance({
    accountId: account.id,
    date: now,
    refBalance: newRefValue,
  });

  await vehicle.update({ valueLastComputedAt: now });

  return { value: newValue, refValue: newRefValue, refreshed: true };
};

export const refreshVehicleValueIfStale = withTransaction(refreshVehicleValueIfStaleImpl);

interface RefreshBulkParams {
  userId: number;
  force?: boolean;
  asOf?: Date;
}

/**
 * Bulk variant — refresh every vehicle for a user that is over the 7-day TTL.
 * Called from the accounts list endpoint so values are fresh in the response.
 *
 * Each per-vehicle refresh runs in its own transaction (via the wrapped
 * `refreshVehicleValueIfStale`) so a failure on one doesn't roll back the
 * successful refreshes that came before it. Errors are logged but not thrown —
 * the caller's response succeeds with whatever values were freshable.
 */
export const refreshStaleVehicleValuesForUser = async ({
  userId,
  force = false,
  asOf,
}: RefreshBulkParams): Promise<{ refreshedCount: number }> => {
  const vehicles = await Vehicles.findAll({
    where: { userId },
    attributes: ['id', 'valueLastComputedAt'],
  });

  if (!vehicles.length) {
    return { refreshedCount: 0 };
  }

  const now = asOf ?? new Date();
  let refreshedCount = 0;

  for (const vehicle of vehicles) {
    const cacheValid =
      !force &&
      vehicle.valueLastComputedAt !== null &&
      now.getTime() - new Date(vehicle.valueLastComputedAt).getTime() < CACHE_TTL_MS;

    if (cacheValid) continue;

    try {
      await refreshVehicleValueIfStale({ vehicleId: vehicle.id, force, asOf });
      refreshedCount += 1;
    } catch (err) {
      logger.warn(`Failed to refresh vehicle value during bulk refresh`, {
        userId,
        vehicleId: vehicle.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { refreshedCount };
};
