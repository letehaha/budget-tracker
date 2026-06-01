import { NotFoundError } from '@js/errors';
import Accounts from '@models/accounts.model';
import Vehicles from '@models/vehicles.model';
import { withTransaction } from '@services/common/with-transaction';

import { refreshVehicleValueIfStale } from './refresh-vehicle-value.service';

interface GetVehicleParams {
  userId: number;
  vehicleId: string;
}

const getVehicleImpl = async ({ userId, vehicleId }: GetVehicleParams) => {
  const vehicle = await Vehicles.findOne({ where: { id: vehicleId, userId } });

  if (!vehicle) {
    throw new NotFoundError({ message: 'Vehicle not found' });
  }

  // Force-refresh on detail reads. The 7-day cache is a perf optimization for
  // the bulk account-list endpoint; the detail page is opened deliberately and
  // a single recompute is cheap. Without `force`, a backdated override stays
  // showing yesterday's anchor value (e.g. €80k from 1.5y ago) instead of
  // today's depreciated value (~€65k) until the cache expires.
  await refreshVehicleValueIfStale({ vehicleId, force: true });

  return Vehicles.findByPk(vehicleId, {
    include: [{ model: Accounts }],
  });
};

export const getVehicle = withTransaction(getVehicleImpl);
