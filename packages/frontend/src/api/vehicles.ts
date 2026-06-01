import { api } from '@/api/_api';
import type { AccountModel, DEPRECIATION_PRESET, RecordId, VEHICLE_CLASS } from '@bt/shared/types';

export interface VehicleModel {
  id: RecordId;
  accountId: RecordId;
  userId: number;
  make: string;
  model: string;
  trim: string | null;
  year: number;
  vehicleClass: VEHICLE_CLASS;
  /** Decimal amount in the vehicle's currency. */
  purchasePrice: number;
  purchaseDate: string;
  /** Decimal amount; set on manual override. */
  valueAnchor: number | null;
  valueAnchorDate: string | null;
  depreciationPreset: DEPRECIATION_PRESET;
  customAnnualRatePct: number | null;
  salvageFloorPct: number;
  currentMileage: number | null;
  valueLastComputedAt: string | null;
  createdAt: string;
  updatedAt: string;
  account: AccountModel | null;
}

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

export const getVehicles = async (): Promise<VehicleModel[]> => {
  return api.get('/vehicles');
};

export const getVehicleById = async ({ id }: { id: string }): Promise<VehicleModel> => {
  return api.get(`/vehicles/${id}`);
};

export const createVehicle = async (payload: CreateVehiclePayload): Promise<VehicleModel> => {
  return api.post('/vehicles', payload);
};

export const updateVehicle = async ({
  id,
  payload,
}: {
  id: string;
  payload: UpdateVehiclePayload;
}): Promise<VehicleModel> => {
  return api.patch(`/vehicles/${id}`, payload);
};

export const deleteVehicle = async ({ id }: { id: string }) => {
  return api.delete(`/vehicles/${id}`);
};
