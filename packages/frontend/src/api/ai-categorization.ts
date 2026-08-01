import { api } from '@/api/_api';
import type { AiCategorizationStatus } from '@bt/shared/types';

/**
 * User-scoped AI categorization status. Fetched on boot to rehydrate the header
 * progress indicator after a page reload — SSE only delivers events that happen
 * while the tab is open. Never 404s: returns `idle` when nothing is running.
 */
export const getAiCategorizationStatus = async (): Promise<AiCategorizationStatus> => {
  return api.get('/user/ai/categorization/status');
};
