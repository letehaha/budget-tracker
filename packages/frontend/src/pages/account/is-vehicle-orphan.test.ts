import { ACCOUNT_CATEGORIES, type RecordId } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import { isGenuineVehicleOrphan } from './is-vehicle-orphan';

const id = (value: string) => value as RecordId;

const vehicleAccount = { id: id('acc-vehicle'), accountCategory: ACCOUNT_CATEGORIES.vehicle };
const generalAccount = { id: id('acc-general'), accountCategory: ACCOUNT_CATEGORIES.general };

describe('isGenuineVehicleOrphan', () => {
  it('returns false for a ghost — id absent from the live accounts list', () => {
    // No vehicle match, but the account is gone from the live list — not an orphan.
    expect(
      isGenuineVehicleOrphan({
        accountId: id('acc-vehicle'),
        liveAccounts: [generalAccount],
        vehicles: [{ accountId: id('acc-other') }],
      }),
    ).toBe(false);
  });

  it('returns true for a genuine orphan — vehicle account present in the live list with no matching vehicle', () => {
    expect(
      isGenuineVehicleOrphan({
        accountId: id('acc-vehicle'),
        liveAccounts: [vehicleAccount],
        vehicles: [{ accountId: id('acc-other') }],
      }),
    ).toBe(true);
  });

  it('returns false when a vehicle record matches the account', () => {
    expect(
      isGenuineVehicleOrphan({
        accountId: id('acc-vehicle'),
        liveAccounts: [vehicleAccount],
        vehicles: [{ accountId: id('acc-vehicle') }],
      }),
    ).toBe(false);
  });

  it('returns false when the live account is not a vehicle', () => {
    expect(
      isGenuineVehicleOrphan({
        accountId: id('acc-general'),
        liveAccounts: [generalAccount],
        vehicles: [],
      }),
    ).toBe(false);
  });

  it('returns false when no account id is provided', () => {
    expect(
      isGenuineVehicleOrphan({
        accountId: undefined,
        liveAccounts: [vehicleAccount],
        vehicles: [],
      }),
    ).toBe(false);
  });
});
