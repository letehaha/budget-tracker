import { NotFoundError } from '@js/errors';
import Vehicles from '@models/vehicles.model';
import { deleteAccountById } from '@services/accounts.service';
import { withTransaction } from '@services/common/with-transaction';

interface DeleteVehicleParams {
  userId: number;
  vehicleId: string;
}

const deleteVehicleImpl = async ({ userId, vehicleId }: DeleteVehicleParams) => {
  const vehicle = await Vehicles.findOne({
    where: { id: vehicleId, userId },
    attributes: ['accountId'],
  });

  if (!vehicle) {
    throw new NotFoundError({ message: 'Vehicle not found' });
  }

  // Delegate to the accounts service so share cleanup, cross-user transfer
  // conversion, and post-commit notification fan-out all run. The Vehicles row
  // is removed via FK ON DELETE CASCADE from Accounts.
  await deleteAccountById({ id: vehicle.accountId, userId });

  return { id: vehicleId };
};

export const deleteVehicle = withTransaction(deleteVehicleImpl);
