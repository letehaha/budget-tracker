import { asDecimal, DEPRECIATION_PRESET, VEHICLE_CLASS } from '@bt/shared/types';
import type { VehicleApiResponse } from '@root/serializers/vehicles.serializer';

import { balanceAdjustment } from './account';
import { makeRequest } from './common';

interface CreateVehiclePayload {
  name: string;
  currencyCode: string;
  make: string;
  model: string;
  trim?: string | null;
  year: number;
  vehicleClass: VEHICLE_CLASS;
  purchasePrice: number;
  purchaseDate: string;
  depreciationPreset?: DEPRECIATION_PRESET;
  customAnnualRatePct?: number | null;
  salvageFloorPct?: number;
  currentMileage?: number | null;
}

interface UpdateVehiclePayload {
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

export async function createVehicle<R extends boolean | undefined = undefined>({
  raw,
  ...payload
}: CreateVehiclePayload & { raw?: R }) {
  return makeRequest<VehicleApiResponse, R>({
    method: 'post',
    url: '/vehicles',
    payload,
    raw,
  });
}

export async function getVehicles<R extends boolean | undefined = undefined>({ raw }: { raw?: R } = {}) {
  return makeRequest<VehicleApiResponse[], R>({
    method: 'get',
    url: '/vehicles',
    raw,
  });
}

export async function getVehicleById<R extends boolean | undefined = undefined>({ id, raw }: { id: string; raw?: R }) {
  return makeRequest<VehicleApiResponse, R>({
    method: 'get',
    url: `/vehicles/${id}`,
    raw,
  });
}

export async function updateVehicle<R extends boolean | undefined = undefined>({
  id,
  raw,
  ...payload
}: UpdateVehiclePayload & { id: string; raw?: R }) {
  return makeRequest<VehicleApiResponse, R>({
    method: 'patch',
    url: `/vehicles/${id}`,
    payload,
    raw,
  });
}

/** Vehicle value override = balance adjustment on the vehicle's account. */
export async function overrideVehicleValue({
  id,
  accountId,
  targetValue,
  note,
  time,
}: {
  id: string;
  accountId: string;
  targetValue: number;
  note?: string;
  time?: Date;
}) {
  const adjustment = await balanceAdjustment({
    id: accountId,
    payload: { targetBalance: asDecimal(targetValue), note, time: time?.toISOString() },
    raw: true,
  });
  const vehicle = await getVehicleById({ id, raw: true });
  return { ...adjustment, vehicle };
}

export async function deleteVehicle<R extends boolean | undefined = undefined>({ id, raw }: { id: string; raw?: R }) {
  return makeRequest<{ id: string }, R>({
    method: 'delete',
    url: `/vehicles/${id}`,
    raw,
  });
}
