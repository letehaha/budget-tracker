import { api } from '@/api/_api';
import type { VenturePlatformModel } from '@bt/shared/types';

interface CreateVenturePlatformPayload {
  name: string;
  website?: string | null;
  description?: string | null;
  defaultEntryFeePct?: string;
  defaultMgmtFeePct?: string;
  defaultCarryPct?: string;
  defaultHurdlePct?: string;
}

type UpdateVenturePlatformPayload = Partial<CreateVenturePlatformPayload>;

interface VenturePlatformsListResponse {
  data: VenturePlatformModel[];
  pagination: { limit: number; offset: number; page: number };
}

export const createVenturePlatform = async (payload: CreateVenturePlatformPayload): Promise<VenturePlatformModel> => {
  return api.post('/venture/platforms', payload);
};

export const listVenturePlatforms = async (
  params: { limit?: number; offset?: number; page?: number } = {},
): Promise<VenturePlatformsListResponse> => {
  return api.get('/venture/platforms', params);
};

export const updateVenturePlatform = async (params: {
  platformId: string;
  payload: UpdateVenturePlatformPayload;
}): Promise<VenturePlatformModel> => {
  return api.put(`/venture/platforms/${params.platformId}`, params.payload);
};

export const deleteVenturePlatform = async (params: { platformId: string; force?: boolean }): Promise<void> => {
  return api.delete(`/venture/platforms/${params.platformId}`, { data: { force: params.force } });
};
