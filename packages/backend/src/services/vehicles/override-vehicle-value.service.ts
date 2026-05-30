import { Money } from '@common/types/money';
import { NotFoundError } from '@js/errors';
import Accounts from '@models/accounts.model';
import Vehicles from '@models/vehicles.model';
import { adjustAccountBalance } from '@services/accounts/balance-adjustment';
import { withTransaction } from '@services/common/with-transaction';
import { format } from 'date-fns';

interface OverrideVehicleValueParams {
  userId: number;
  vehicleId: string;
  targetValue: Money;
  note?: string;
}

/**
 * Manual override of a vehicle's current value.
 *
 * Piggybacks on the existing balance-adjustment mechanism — creates a
 * `transfer_out_wallet` Transaction for the diff, which auto-cascades into
 * Account.currentBalance + Balances time-series via the Transactions
 * @AfterCreate hook. We then update the Vehicle anchor so future depreciation
 * runs from this new value forward.
 */
const overrideVehicleValueImpl = async ({ userId, vehicleId, targetValue, note }: OverrideVehicleValueParams) => {
  const vehicle = await Vehicles.findOne({ where: { id: vehicleId, userId } });

  if (!vehicle) {
    throw new NotFoundError({ message: 'Vehicle not found' });
  }

  const result = await adjustAccountBalance({
    userId,
    accountId: vehicle.accountId,
    targetBalance: targetValue,
    note,
  });

  const now = new Date();
  const todayString = format(now, 'yyyy-MM-dd');

  await vehicle.update({
    valueAnchor: targetValue,
    valueAnchorDate: todayString,
    valueLastComputedAt: now,
  });

  return {
    adjustment: result,
    vehicle: await Vehicles.findByPk(vehicleId, { include: [{ model: Accounts }] }),
  };
};

export const overrideVehicleValue = withTransaction(overrideVehicleValueImpl);
