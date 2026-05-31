import {
  ACCOUNT_CATEGORIES,
  asDecimal,
  DEPRECIATION_PRESET,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  VEHICLE_CLASS,
} from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import Vehicles from '@models/vehicles.model';
import * as helpers from '@tests/helpers';
import { format, subDays, subYears } from 'date-fns';

function todayString(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function pastDateString({ yearsAgo }: { yearsAgo: number }): string {
  return format(subYears(new Date(), yearsAgo), 'yyyy-MM-dd');
}

function basePayload(overrides: Partial<Parameters<typeof helpers.createVehicle>[0]> = {}) {
  return {
    name: 'Toyota Camry 2020',
    currencyCode: 'USD',
    make: 'Toyota',
    model: 'Camry',
    year: 2020,
    vehicleClass: VEHICLE_CLASS.sedan,
    purchasePrice: 25000,
    purchaseDate: pastDateString({ yearsAgo: 3 }),
    ...overrides,
  };
}

describe('Vehicles', () => {
  describe('POST /vehicles', () => {
    it('creates a vehicle with a system account, current value below purchase price', async () => {
      const response = await helpers.createVehicle({ ...basePayload(), raw: true });

      expect(response).toBeDefined();
      expect(response.id).toEqual(expect.any(String));
      expect(response.make).toBe('Toyota');
      expect(response.model).toBe('Camry');
      expect(response.year).toBe(2020);
      expect(response.vehicleClass).toBe(VEHICLE_CLASS.sedan);
      expect(response.purchasePrice).toBe(25000);
      expect(response.depreciationPreset).toBe(DEPRECIATION_PRESET.classDefault);
      expect(response.salvageFloorPct).toBe(10);

      expect(response.account).not.toBeNull();
      expect(response.account!.accountCategory).toBe(ACCOUNT_CATEGORIES.vehicle);
      expect(response.account!.currentBalance).toBeLessThan(25000);
      expect(response.account!.currentBalance).toBeGreaterThan(10000);
    });

    it('rejects negative purchase price', async () => {
      const response = await helpers.createVehicle({
        ...basePayload({ purchasePrice: -100 }),
        raw: false,
      });
      expect(response.statusCode).toBe(422);
    });

    it('rejects year out of range', async () => {
      const response = await helpers.createVehicle({
        ...basePayload({ year: 1800 }),
        raw: false,
      });
      expect(response.statusCode).toBe(422);
    });

    it('rejects custom preset without customAnnualRatePct', async () => {
      const response = await helpers.createVehicle({
        ...basePayload({
          depreciationPreset: DEPRECIATION_PRESET.custom,
          customAnnualRatePct: null,
        }),
        raw: false,
      });
      expect(response.statusCode).toBe(422);
    });
  });

  describe('GET /vehicles', () => {
    it('returns empty list when user has no vehicles', async () => {
      const list = await helpers.getVehicles({ raw: true });
      expect(list).toEqual([]);
    });

    it('returns the user’s vehicles', async () => {
      await helpers.createVehicle({ ...basePayload(), raw: true });
      await helpers.createVehicle({
        ...basePayload({ name: 'Truck', make: 'Ford', model: 'F-150', vehicleClass: VEHICLE_CLASS.truck }),
        raw: true,
      });

      const list = await helpers.getVehicles({ raw: true });
      expect(list.length).toBe(2);
    });
  });

  describe('depreciation math', () => {
    it('luxury depreciates faster than sedan over Y1 with same purchase price/date', async () => {
      const sedan = await helpers.createVehicle({
        ...basePayload({ vehicleClass: VEHICLE_CLASS.sedan, purchaseDate: pastDateString({ yearsAgo: 1 }) }),
        raw: true,
      });
      const luxury = await helpers.createVehicle({
        ...basePayload({
          name: 'Lux',
          make: 'BMW',
          model: '7 Series',
          vehicleClass: VEHICLE_CLASS.luxury,
          purchaseDate: pastDateString({ yearsAgo: 1 }),
        }),
        raw: true,
      });

      expect(luxury.account!.currentBalance).toBeLessThan(sedan.account!.currentBalance);
    });

    it('custom flat rate is applied compounded year-over-year', async () => {
      const vehicle = await helpers.createVehicle({
        ...basePayload({
          purchasePrice: 10000,
          purchaseDate: pastDateString({ yearsAgo: 2 }),
          depreciationPreset: DEPRECIATION_PRESET.custom,
          customAnnualRatePct: 10,
        }),
        raw: true,
      });

      // 10000 * 0.9 * 0.9 = 8100 (allow small partial-year + rounding drift)
      expect(vehicle.account!.currentBalance).toBeGreaterThan(7500);
      expect(vehicle.account!.currentBalance).toBeLessThan(8200);
    });

    it('honors the salvage floor when depreciation would otherwise undercut it', async () => {
      const vehicle = await helpers.createVehicle({
        ...basePayload({
          purchasePrice: 20000,
          purchaseDate: pastDateString({ yearsAgo: 30 }),
          // 50%/yr custom rate crashes the value past the floor within a few
          // years — exercises the floor-clamping branch rather than the curve.
          depreciationPreset: DEPRECIATION_PRESET.custom,
          customAnnualRatePct: 50,
          salvageFloorPct: 30,
        }),
        raw: true,
      });

      // Floor: 20000 * 0.30 = 6000
      expect(vehicle.account!.currentBalance).toBe(6000);
    });
  });

  describe('PATCH /vehicles/:id', () => {
    it('updates currentMileage without retriggering value recompute (cache stays)', async () => {
      const vehicle = await helpers.createVehicle({ ...basePayload(), raw: true });

      const initialComputedAt = await Vehicles.findByPk(vehicle.id).then((v) => v?.valueLastComputedAt);
      expect(initialComputedAt).toBeDefined();

      const updated = await helpers.updateVehicle({
        id: vehicle.id,
        currentMileage: 65000,
        raw: true,
      });

      expect(updated.currentMileage).toBe(65000);
      // cache stamp unchanged
      const after = await Vehicles.findByPk(vehicle.id).then((v) => v?.valueLastComputedAt);
      expect(after?.getTime()).toBe(initialComputedAt?.getTime());
    });

    it('force-refreshes value when curve params change', async () => {
      const vehicle = await helpers.createVehicle({ ...basePayload(), raw: true });
      const initialBalance = vehicle.account!.currentBalance;

      const updated = await helpers.updateVehicle({
        id: vehicle.id,
        depreciationPreset: DEPRECIATION_PRESET.fast,
        raw: true,
      });

      expect(updated.account!.currentBalance).toBeLessThan(initialBalance);
    });
  });

  describe('POST /vehicles/:id/value (manual override)', () => {
    it('creates a transfer_out_wallet income transaction when overriding above current value', async () => {
      const vehicle = await helpers.createVehicle({ ...basePayload(), raw: true });
      const previousBalance = vehicle.account!.currentBalance;
      const newValue = previousBalance + 5000;

      const response = await helpers.overrideVehicleValue({
        id: vehicle.id,
        targetValue: newValue,
        note: 'Got an appraisal',
        raw: true,
      });

      expect(response.transaction).not.toBeNull();
      expect(response.transaction!.transactionType).toBe(TRANSACTION_TYPES.income);
      expect(response.transaction!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_out_wallet);
      expect(response.newBalance).toBeCloseTo(newValue, 2);
      expect(response.vehicle!.valueAnchor).toBeCloseTo(newValue, 2);
      expect(response.vehicle!.valueAnchorDate).toBe(todayString());
      expect(response.vehicle!.account!.currentBalance).toBeCloseTo(newValue, 2);
    });

    it('creates an expense transaction when overriding below current value', async () => {
      const vehicle = await helpers.createVehicle({ ...basePayload(), raw: true });
      const newValue = vehicle.account!.currentBalance - 1000;

      const response = await helpers.overrideVehicleValue({
        id: vehicle.id,
        targetValue: newValue,
        raw: true,
      });

      expect(response.transaction!.transactionType).toBe(TRANSACTION_TYPES.expense);
    });
  });

  describe('lazy 7-day cache', () => {
    it('second list GET within 7 days does not change valueLastComputedAt', async () => {
      // The 7-day cache applies to bulk/list reads (GET /vehicles, GET /accounts).
      // GET /vehicles/:id force-refreshes deliberately, so this test deliberately
      // uses the list endpoint to exercise the cache.
      const vehicle = await helpers.createVehicle({ ...basePayload(), raw: true });
      const first = await Vehicles.findByPk(vehicle.id).then((v) => v!.valueLastComputedAt!.getTime());

      await helpers.getVehicles({ raw: true });

      const second = await Vehicles.findByPk(vehicle.id).then((v) => v!.valueLastComputedAt!.getTime());
      expect(second).toBe(first);
    });

    it('list GET after the cache window expires refreshes valueLastComputedAt', async () => {
      const vehicle = await helpers.createVehicle({ ...basePayload(), raw: true });

      // Backdate the cache stamp to 10 days ago to simulate staleness.
      await Vehicles.update({ valueLastComputedAt: subDays(new Date(), 10) }, { where: { id: vehicle.id } });
      const before = await Vehicles.findByPk(vehicle.id).then((v) => v!.valueLastComputedAt!.getTime());

      await helpers.getVehicles({ raw: true });

      const after = await Vehicles.findByPk(vehicle.id).then((v) => v!.valueLastComputedAt!.getTime());
      expect(after).toBeGreaterThan(before);
    });
  });

  describe('integration with accounts list', () => {
    it('vehicle appears in GET /accounts with its depreciated balance', async () => {
      const vehicle = await helpers.createVehicle({ ...basePayload(), raw: true });
      const accounts = await helpers.getAccounts();
      const found = accounts.find((a) => a.id === vehicle.accountId);

      expect(found).toBeDefined();
      expect(found!.accountCategory).toBe(ACCOUNT_CATEGORIES.vehicle);
      expect(Number(found!.currentBalance)).toBeCloseTo(vehicle.account!.currentBalance, 2);
    });
  });

  describe('DELETE /vehicles/:id', () => {
    it('deletes the vehicle and its underlying account', async () => {
      const vehicle = await helpers.createVehicle({ ...basePayload(), raw: true });
      await helpers.deleteVehicle({ id: vehicle.id, raw: true });

      const list = await helpers.getVehicles({ raw: true });
      expect(list.find((v) => v.id === vehicle.id)).toBeUndefined();

      const accounts = await helpers.getAccounts();
      expect(accounts.find((a) => a.id === vehicle.accountId)).toBeUndefined();
    });

    it('returns 404 for non-existent vehicle id', async () => {
      const response = await helpers.deleteVehicle({ id: generateRandomRecordId(), raw: false });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('Override delete reconciliation', () => {
    it('clears the anchor back to purchase when the only override is deleted', async () => {
      // Create vehicle (no overrides yet) → anchor null. Override once → anchor
      // set. Delete that override tx → anchor must go back to null, and the
      // current balance must match the pure depreciation-curve value from purchase.
      const vehicle = await helpers.createVehicle({ ...basePayload(), raw: true });
      const baselineBalance = vehicle.account!.currentBalance;
      const purchasePrice = vehicle.purchasePrice;

      const override = await helpers.overrideVehicleValue({
        id: vehicle.id,
        targetValue: baselineBalance + 4000,
        raw: true,
      });

      expect(override.vehicle!.valueAnchor).not.toBeNull();
      expect(override.transaction).not.toBeNull();
      const overrideTxId = override.transaction!.id;

      const deleteResponse = await helpers.makeRequest({
        method: 'delete',
        url: `/transactions/${overrideTxId}`,
      });
      expect(deleteResponse.statusCode).toBe(200);

      const refreshed = await helpers.getVehicleById({ id: vehicle.id, raw: true });

      expect(refreshed.valueAnchor).toBeNull();
      expect(refreshed.valueAnchorDate).toBeNull();
      // Curve-derived value is less than purchase price (the vehicle was purchased
      // 3 years ago in basePayload). It should match the pre-override baseline
      // since no other state changed and we're back on the pure curve.
      expect(refreshed.account!.currentBalance).toBeLessThan(purchasePrice);
      expect(refreshed.account!.currentBalance).toBeCloseTo(baselineBalance, 0);
    });

    it('re-anchors to the prior override when the latest override is deleted', async () => {
      // Two overrides at distinct effective times. Delete the LATEST → anchor
      // must reconstruct to the prior override's (value, date), not zero out
      // and not stick with the deleted value.
      const vehicle = await helpers.createVehicle({ ...basePayload(), raw: true });
      const baseBalance = vehicle.account!.currentBalance;

      const olderTime = subDays(new Date(), 5);
      const olderOverride = await helpers.overrideVehicleValue({
        id: vehicle.id,
        targetValue: baseBalance + 2000,
        time: olderTime,
        raw: true,
      });
      expect(olderOverride.transaction).not.toBeNull();
      const olderAnchorValue = olderOverride.vehicle!.valueAnchor!;
      const olderAnchorDate = olderOverride.vehicle!.valueAnchorDate!;
      // Sanity: backdated override re-anchored to the older date, not today.
      expect(olderAnchorDate).toBe(format(olderTime, 'yyyy-MM-dd'));

      // Make the latest override happen now — anchor flips to today.
      const newerOverride = await helpers.overrideVehicleValue({
        id: vehicle.id,
        targetValue: baseBalance + 6000,
        raw: true,
      });
      expect(newerOverride.transaction).not.toBeNull();
      expect(newerOverride.vehicle!.valueAnchorDate).toBe(format(new Date(), 'yyyy-MM-dd'));

      const newerTxId = newerOverride.transaction!.id;
      const deleteResponse = await helpers.makeRequest({
        method: 'delete',
        url: `/transactions/${newerTxId}`,
      });
      expect(deleteResponse.statusCode).toBe(200);

      const refreshed = await helpers.getVehicleById({ id: vehicle.id, raw: true });

      // After deleting the latest override, the reconstruction should collapse
      // back to the prior override's anchor point. The value tolerance is
      // generous: reconstruct walks the curve from purchase to the prior
      // override's date and adds the signed tx amount, which can differ by a
      // few days of depreciation from the value the override recorded live
      // (which used today's account balance as its baseline).
      expect(refreshed.valueAnchor).not.toBeNull();
      expect(refreshed.valueAnchorDate).toBe(olderAnchorDate);
      // ±$200 covers a few days of curve drift on any vehicle under $100k.
      expect(Math.abs(refreshed.valueAnchor! - olderAnchorValue)).toBeLessThan(200);
      // And the reconstructed anchor must NOT equal the deleted newer override's value.
      expect(refreshed.valueAnchor!).toBeLessThan(baseBalance + 6000 - 100);
    });

    // NOTE: the "deleting a non-override tx on a vehicle account" case is no longer
    // testable — the model invariant (enforceVehicleAccountInvariant) forbids creating
    // any non-`transfer_out_wallet` transaction on a vehicle account, so the reconcile
    // hook's transferNature short-circuit can never be reached via the API. The
    // rejection itself is covered in vehicle-write-guards.e2e.ts.

    it('does not crash when deleting a balance-adjustment override on a non-vehicle account', async () => {
      // The hook checks `accountCategory === vehicle` and short-circuits otherwise.
      // Create a regular account, do a balance adjustment (which creates a
      // transfer_out_wallet tx), then delete that tx — the AfterDestroy hook
      // must not throw or attempt to reconcile a non-existent vehicle.
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
        raw: true,
      });

      const adjustment = await helpers.balanceAdjustment({
        id: account.id,
        payload: { targetBalance: asDecimal(1500) },
        raw: true,
      });
      expect(adjustment.transaction).not.toBeNull();
      const adjustmentTxId = adjustment.transaction!.id;

      const deleteResponse = await helpers.makeRequest({
        method: 'delete',
        url: `/transactions/${adjustmentTxId}`,
      });

      // The reconciliation hook must short-circuit cleanly — no 500.
      expect(deleteResponse.statusCode).toBe(200);

      // And the account itself still loads (balance reverts to pre-adjustment).
      const accountAfter = await helpers.getAccount({ id: account.id, raw: true });
      expect(accountAfter).toBeDefined();
    });
  });
});
