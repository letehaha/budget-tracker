import { api } from '@/api/_api';
import type {
  AiCategorizationCandidatesResponse,
  AiCategorizationStatus,
  AiCategorizationTriggerResponse,
  SORT_DIRECTIONS,
  TRANSACTION_SORT_FIELD,
} from '@bt/shared/types';

/** Never 404s: returns `idle` when nothing is running. */
export const getAiCategorizationStatus = async (): Promise<AiCategorizationStatus> => {
  return api.get('/user/ai/categorization/status');
};

/** Omit `transactionIds` to run over every candidate; pass ids to run only over those of them that are candidates. */
export const triggerAiCategorization = async (
  payload: { transactionIds?: string[] } = {},
): Promise<AiCategorizationTriggerResponse> => {
  return api.post('/user/ai/categorization/trigger', payload);
};

/** The same transactions a run would process, paginated for display. */
export const getAiCategorizationCandidates = async (params: {
  limit?: number;
  offset?: number;
  sortBy?: TRANSACTION_SORT_FIELD;
  order?: SORT_DIRECTIONS;
}): Promise<AiCategorizationCandidatesResponse> => {
  return api.get('/user/ai/categorization/candidates', params);
};
