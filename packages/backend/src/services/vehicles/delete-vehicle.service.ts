import { NotFoundError } from '@js/errors';
import Accounts from '@models/accounts.model';
import Vehicles from '@models/vehicles.model';
import { withTransaction } from '@services/common/with-transaction';

interface DeleteVehicleParams {
  userId: number;
  vehicleId: string;
}

const deleteVehicleImpl = async ({ userId, vehicleId }: DeleteVehicleParams) => {
  const vehicle = await Vehicles.findOne({ where: { id: vehicleId, userId } });

  if (!vehicle) {
    throw new NotFoundError({ message: 'Vehicle not found' });
  }

  // Cascade deletion runs from the Account row — Vehicles FK has ON DELETE
  // CASCADE, and Transactions / Balances cascade from Accounts too. So we delete
  // the underlying Account and Postgres tears down the rest.
  await Accounts.destroy({ where: { id: vehicle.accountId, userId } });

  return { id: vehicleId };
};

export const deleteVehicle = withTransaction(deleteVehicleImpl);
