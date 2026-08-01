import { api } from '@/api/_api';
import type { AiCategorizationStatus } from '@bt/shared/types';

/** Never 404s: returns `idle` when nothing is running. */
export const getAiCategorizationStatus = async (): Promise<AiCategorizationStatus> => {
  return api.get('/user/ai/categorization/status');
};
