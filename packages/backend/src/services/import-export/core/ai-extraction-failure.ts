// Both AI import parsers (statement + investment) answer their controllers with the
// same error shape, and a failure of the underlying AI call must produce the same
// verdict whichever parser dialled it.

import { logger } from '@js/utils';
import {
  type AIClientResult,
  CUSTOM_ENDPOINT_UNREACHABLE_ERROR_MESSAGE,
  buildModelNotServedMessage,
  getHttpStatus,
  isCustomEndpointDown,
  isModelNotFoundError,
  markCustomEndpointUnreachable,
  unwrapRetryError,
} from '@services/ai';

/** Failure shape the AI import parsers return to their controllers. */
export interface AIExtractionError {
  code: 'NO_AI_CONFIGURED' | 'AI_ERROR' | 'EXTRACTION_FAILED' | 'NO_TRANSACTIONS_FOUND' | 'RATE_LIMITED';
  message: string;
  details?: string;
}

/**
 * The extraction failures a user can act on: a dead custom endpoint (also flagged in
 * AI settings so the row shows a way back), a model the endpoint does not serve, or a
 * rate limit. Anything else returns null for the caller to report as a plain failure.
 */
export async function classifyAiExtractionFailure({
  userId,
  aiClient,
  error,
  logPrefix,
}: {
  userId: number;
  aiClient: AIClientResult;
  error: unknown;
  logPrefix: string;
}): Promise<AIExtractionError | null> {
  const cause = unwrapRetryError({ error });
  const details = cause instanceof Error ? cause.message : 'Unknown error';

  // A server the user has to bring back up: flagged on the endpoint so AI settings
  // shows it as down, instead of a raw SDK message next to a green row.
  if (isCustomEndpointDown({ error: cause, aiClient })) {
    logger.info(`${logPrefix} AI endpoint did not answer`, { modelId: aiClient.modelId });
    await markCustomEndpointUnreachable({ userId, aiClient });

    return { code: 'AI_ERROR', message: CUSTOM_ENDPOINT_UNREACHABLE_ERROR_MESSAGE, details };
  }

  // The user picked a model the endpoint does not have: their config, not our bug.
  if (isModelNotFoundError({ error: cause })) {
    logger.info(`${logPrefix} Configured AI model is not served by the endpoint`, { modelId: aiClient.modelId });

    return { code: 'AI_ERROR', message: buildModelNotServedMessage({ modelId: aiClient.modelId }), details };
  }

  // Status check, not message sniffing: provider error text like "Failed to generate"
  // contains "rate" and would misread as a rate limit.
  if (getHttpStatus({ error: cause }) === 429) {
    logger.info(`${logPrefix} AI provider rate limit hit`, { modelId: aiClient.modelId });

    return {
      code: 'RATE_LIMITED',
      message: 'AI provider rate limit reached. Please try again in a few minutes.',
      details,
    };
  }

  return null;
}
