import { deleteAccountById } from '@services/accounts.service';
import { withTransaction } from '@services/common/with-transaction';

import { findVehicleOrThrow } from './helpers';

interface DeleteVehicleParams {
  userId: number;
  vehicleId: string;
}

const deleteVehicleImpl = async ({ userId, vehicleId }: DeleteVehicleParams) => {
  const vehicle = await findVehicleOrThrow({ vehicleId, userId, attributes: ['accountId'] });

  // Delegate to the accounts service so share cleanup, cross-user transfer
  // conversion, and post-commit notification fan-out all run. The Vehicles row
  // is removed via FK ON DELETE CASCADE from Accounts.
  await deleteAccountById({ id: vehicle.accountId, userId });

  return { id: vehicleId };
};

export const deleteVehicle = withTransaction(deleteVehicleImpl);
