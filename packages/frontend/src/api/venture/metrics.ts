import { api } from '@/api/_api';
import type { VentureDealMetricsModel } from '@bt/shared/types';

export const getVentureDealMetrics = async (params: { dealId: string }): Promise<VentureDealMetricsModel> => {
  return api.get(`/venture/deals/${params.dealId}/metrics`);
};
