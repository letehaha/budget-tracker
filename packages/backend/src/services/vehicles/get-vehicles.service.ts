import Accounts from '@models/accounts.model';
import Vehicles from '@models/vehicles.model';
import { withTransaction } from '@services/common/with-transaction';
import { getAccessibleAccountIdsForUser } from '@services/sharing/auth/get-accessible-account-ids.service';

import { refreshStaleVehicleValuesForUser } from './refresh-vehicle-value.service';

interface GetVehiclesParams {
  userId: number;
}

const getVehiclesImpl = async ({ userId }: GetVehiclesParams) => {
  // Refresh any vehicles whose 7-day cache has expired so the returned values
  // are fresh in the response. Errors per-vehicle are swallowed inside.
  await refreshStaleVehicleValuesForUser({ userId });

  const accountIds = await getAccessibleAccountIdsForUser({ userId });

  return Vehicles.findAll({
    where: { accountId: accountIds },
    include: [{ model: Accounts }],
    order: [['createdAt', 'DESC']],
  });
};

export const getVehicles = withTransaction(getVehiclesImpl);
