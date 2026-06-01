import { DEPRECIATION_PRESET, VEHICLE_CLASS } from '@bt/shared/types';
import { NotFoundError, ValidationError } from '@js/errors';
import Accounts from '@models/accounts.model';
import Vehicles from '@models/vehicles.model';
import { withTransaction } from '@services/common/with-transaction';

import { refreshVehicleValueIfStale } from './refresh-vehicle-value.service';

interface UpdateVehicleParams {
  userId: number;
  vehicleId: string;
  name?: string;
  make?: string;
  model?: string;
  trim?: string | null;
  year?: number;
  vehicleClass?: VEHICLE_CLASS;
  depreciationPreset?: DEPRECIATION_PRESET;
  customAnnualRatePct?: number | null;
  salvageFloorPct?: number;
  currentMileage?: number | null;
}

const updateVehicleImpl = async (params: UpdateVehicleParams) => {
  const { userId, vehicleId, name, ...rest } = params;

  const vehicle = await Vehicles.findOne({ where: { id: vehicleId, userId } });

  if (!vehicle) {
    throw new NotFoundError({ message: 'Vehicle not found' });
  }

  const currentCustomRate = vehicle.customAnnualRatePct ? Number(vehicle.customAnnualRatePct) : null;
  const currentSalvageFloor = Number(vehicle.salvageFloorPct);
  const curveAffectingChange =
    (rest.vehicleClass !== undefined && rest.vehicleClass !== vehicle.vehicleClass) ||
    (rest.depreciationPreset !== undefined && rest.depreciationPreset !== vehicle.depreciationPreset) ||
    (rest.customAnnualRatePct !== undefined && rest.customAnnualRatePct !== currentCustomRate) ||
    (rest.salvageFloorPct !== undefined && rest.salvageFloorPct !== currentSalvageFloor);

  // If the user switched to custom preset, an annual rate must be present
  // (either supplied in this update or already stored).
  const resolvedPreset = rest.depreciationPreset ?? vehicle.depreciationPreset;
  const resolvedCustomRate =
    rest.customAnnualRatePct !== undefined
      ? rest.customAnnualRatePct
      : vehicle.customAnnualRatePct
        ? Number(vehicle.customAnnualRatePct)
        : null;

  if (resolvedPreset === DEPRECIATION_PRESET.custom && resolvedCustomRate == null) {
    throw new ValidationError({
      message: 'customAnnualRatePct is required when depreciationPreset = custom',
    });
  }

  // DECIMAL columns are stored as strings; the API surfaces these percentages as
  // numbers, so convert the two rate fields before persisting.
  const { customAnnualRatePct, salvageFloorPct, ...restFields } = rest;
  await vehicle.update({
    ...restFields,
    ...(customAnnualRatePct !== undefined && {
      customAnnualRatePct: customAnnualRatePct == null ? null : String(customAnnualRatePct),
    }),
    ...(salvageFloorPct !== undefined && { salvageFloorPct: String(salvageFloorPct) }),
  });

  if (name !== undefined) {
    await Accounts.update({ name }, { where: { id: vehicle.accountId, userId } });
  }

  if (curveAffectingChange) {
    await refreshVehicleValueIfStale({ vehicleId, force: true });
  }

  return Vehicles.findByPk(vehicleId, {
    include: [{ model: Accounts }],
  });
};

export const updateVehicle = withTransaction(updateVehicleImpl);
