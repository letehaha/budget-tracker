import { RESOURCE_TYPES, SHARE_PERMISSIONS } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import Accounts from '@models/accounts.model';
import Vehicles from '@models/vehicles.model';
import { withTransaction } from '@services/common/with-transaction';
import { canUserAccessResource } from '@services/sharing/auth/can-user-access-resource.service';

import { refreshVehicleValueIfStale } from './refresh-vehicle-value.service';

interface GetVehicleParams {
  userId: number;
  vehicleId: string;
}

const getVehicleImpl = async ({ userId, vehicleId }: GetVehicleParams) => {
  const message = t({ key: 'vehicles.notFound' });
  const vehicle = await findOrThrowNotFound({
    query: Vehicles.findByPk(vehicleId, { attributes: ['accountId'] }),
    message,
  });
  const access = await canUserAccessResource({
    userId,
    resourceType: RESOURCE_TYPES.account,
    resourceId: vehicle.accountId,
    requiredPermission: SHARE_PERMISSIONS.read,
  });
  if (!access.granted) throw new NotFoundError({ message });

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
