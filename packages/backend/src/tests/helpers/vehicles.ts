import { DEPRECIATION_PRESET, VEHICLE_CLASS } from '@bt/shared/types';
import type { TransactionApiResponse } from '@root/serializers';
import type { VehicleApiResponse } from '@root/serializers/vehicles.serializer';

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

export interface OverrideVehicleValueApiResponse {
  vehicle: VehicleApiResponse | null;
  transaction: TransactionApiResponse | null;
  previousBalance: number;
  newBalance: number;
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

export async function overrideVehicleValue<R extends boolean | undefined = undefined>({
  id,
  targetValue,
  note,
  raw,
}: {
  id: string;
  targetValue: number;
  note?: string;
  raw?: R;
}) {
  return makeRequest<OverrideVehicleValueApiResponse, R>({
    method: 'post',
    url: `/vehicles/${id}/value`,
    payload: { targetValue, ...(note !== undefined ? { note } : {}) },
    raw,
  });
}

export async function deleteVehicle<R extends boolean | undefined = undefined>({ id, raw }: { id: string; raw?: R }) {
  return makeRequest<{ id: string }, R>({
    method: 'delete',
    url: `/vehicles/${id}`,
    raw,
  });
}
