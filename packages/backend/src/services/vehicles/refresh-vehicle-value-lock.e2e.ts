import { VEHICLE_CLASS } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { redisClient } from '@root/redis-client';
import { buildLockKey } from '@services/currencies/base-currency-lock';
import * as helpers from '@tests/helpers';
import { format, subYears } from 'date-fns';

// GET /vehicles/:id force-refreshes the depreciated value on every read and
// stamps `valueLastComputedAt`. The base-currency lock must suppress that
// refresh (the recalc owns the ref* amounts), so the stored value — and its
// `valueLastComputedAt` — stay frozen until the lock clears.
describe('Vehicle lazy refresh — base-currency lock', () => {
  it('skips the force-refresh while the lock is held, then refreshes once it clears', async () => {
    const vehicle = await helpers.createVehicle({
      name: 'Toyota Camry 2020',
      currencyCode: 'USD',
      make: 'Toyota',
      model: 'Camry',
      year: 2020,
      vehicleClass: VEHICLE_CLASS.sedan,
      purchasePrice: 25000,
      purchaseDate: format(subYears(new Date(), 3), 'yyyy-MM-dd'),
      raw: true,
    });

    const computedAtOnCreate = vehicle.valueLastComputedAt;
    expect(computedAtOnCreate).toBeTruthy();

    const lockKey = buildLockKey(vehicle.userId);
    await redisClient.set(lockKey, 'test-lock');

    // Locked: the detail read must NOT recompute, so `valueLastComputedAt` stays
    // exactly at creation time (a refresh would have advanced it).
    const whileLocked = await helpers.getVehicleById({ id: vehicle.id, raw: true });
    expect(whileLocked.valueLastComputedAt).toBe(computedAtOnCreate);

    await redisClient.del(lockKey);

    // Unlocked: the force-refresh runs again and advances `valueLastComputedAt`.
    const afterUnlock = await helpers.getVehicleById({ id: vehicle.id, raw: true });
    expect(afterUnlock.valueLastComputedAt).not.toBe(computedAtOnCreate);
    expect(new Date(afterUnlock.valueLastComputedAt!).getTime()).toBeGreaterThan(
      new Date(computedAtOnCreate!).getTime(),
    );
  });
});
