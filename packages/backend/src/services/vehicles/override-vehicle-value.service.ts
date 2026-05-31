import { Money } from '@common/types/money';
import { NotFoundError } from '@js/errors';
import Accounts from '@models/accounts.model';
import Vehicles from '@models/vehicles.model';
import { adjustAccountBalance } from '@services/accounts/balance-adjustment';
import { withTransaction } from '@services/common/with-transaction';

interface OverrideVehicleValueParams {
  userId: number;
  vehicleId: string;
  targetValue: Money;
  note?: string;
  /** Effective date of the override. Defaults to now when omitted — pass a past date to backdate. */
  time?: Date;
}

/**
 * Manual override of a vehicle's current value.
 *
 * Delegates to `adjustAccountBalance`, which detects the vehicle account
 * category and re-anchors `(valueAnchor, valueAnchorDate)` to (`targetValue`,
 * `effectiveTime`), then force-refreshes so `Account.currentBalance` reflects
 * today's depreciated value rather than the user-typed (possibly backdated)
 * target. No double-write needed here.
 */
const overrideVehicleValueImpl = async ({ userId, vehicleId, targetValue, note, time }: OverrideVehicleValueParams) => {
  const vehicle = await Vehicles.findOne({ where: { id: vehicleId, userId } });

  if (!vehicle) {
    throw new NotFoundError({ message: 'Vehicle not found' });
  }

  const result = await adjustAccountBalance({
    userId,
    accountId: vehicle.accountId,
    targetBalance: targetValue,
    note,
    time,
    // The sole sanctioned caller allowed to move a vehicle account's balance —
    // adjustAccountBalance re-anchors the depreciation curve for vehicles.
    allowVehicle: true,
  });

  return {
    adjustment: result,
    vehicle: await Vehicles.findByPk(vehicleId, { include: [{ model: Accounts }] }),
  };
};

export const overrideVehicleValue = withTransaction(overrideVehicleValueImpl);
