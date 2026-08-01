import { AI_PROVIDER } from '@bt/shared/types';
import { logger } from '@js/utils';
import {
  type AIClientResult,
  CUSTOM_ENDPOINT_UNREACHABLE_ERROR_MESSAGE,
  buildModelNotServedMessage,
  classifyAiCallFailure,
  markCustomEndpointUnreachable,
} from '@services/ai';
import { markApiKeyInvalid } from '@services/user-settings/ai-api-key';
import { markCustomEndpointInvalid } from '@services/user-settings/ai-custom-endpoint';

export interface AIExtractionError {
  code: 'NO_AI_CONFIGURED' | 'AI_ERROR' | 'EXTRACTION_FAILED' | 'NO_TRANSACTIONS_FOUND' | 'RATE_LIMITED';
  message: string;
  details?: string;
}

/** A local endpoint often has no key at all, so credits-and-permissions advice would mislead. */
const CUSTOM_ENDPOINT_REJECTED_ERROR_MESSAGE =
  'Your custom AI endpoint rejected the request. Please verify its URL, model name, and API key in AI settings.';

const INVALID_KEY_ERROR_MESSAGE =
  'API key is not working. Please verify the key is correct, has sufficient credits, and has the required permissions.';

const TEMPORARY_ERROR_MESSAGE = 'AI provider temporarily unavailable. Please try again later.';

/**
 * Turns a failed AI call into the error the parser answers with, and flags a dead or
 * key-rejecting endpoint so AI settings shows a way back. Failures the user can fix are
 * logged at info, so only unclassified ones reach Sentry.
 */
export async function resolveAiExtractionFailure({
  userId,
  aiClient,
  error,
  logPrefix,
}: {
  userId: number;
  aiClient: AIClientResult;
  error: unknown;
  logPrefix: string;
}): Promise<{ error: AIExtractionError; cause: Error }> {
  const { kind, cause } = classifyAiCallFailure({ error });
  const details = cause.message;
  const isUserOwnedEndpoint = aiClient.provider === AI_PROVIDER.custom;

  // Only a user's own endpoint gets flagged: a catalog provider going quiet is transient.
  if (kind === 'endpoint-down' && !isUserOwnedEndpoint) {
    logger.info(`${logPrefix} AI provider connection failed`, { modelId: aiClient.modelId });

    return { error: { code: 'AI_ERROR', message: TEMPORARY_ERROR_MESSAGE, details }, cause };
  }

  switch (kind) {
    case 'blocked-address': {
      // The outbound guard's own message names the address and why it was refused
      logger.info(`${logPrefix} custom endpoint address blocked: ${details}`, { modelId: aiClient.modelId });

      return { error: { code: 'AI_ERROR', message: cause.message }, cause };
    }

    case 'endpoint-down': {
      logger.info(`${logPrefix} AI endpoint did not answer`, { modelId: aiClient.modelId });
      await markCustomEndpointUnreachable({ userId, aiClient });

      return { error: { code: 'AI_ERROR', message: CUSTOM_ENDPOINT_UNREACHABLE_ERROR_MESSAGE, details }, cause };
    }

    case 'model-not-found': {
      logger.info(`${logPrefix} Configured AI model is not served by the endpoint`, { modelId: aiClient.modelId });

      return {
        error: { code: 'AI_ERROR', message: buildModelNotServedMessage({ modelId: aiClient.modelId }), details },
        cause,
      };
    }

    case 'rate-limited': {
      logger.info(`${logPrefix} AI provider rate limit hit`, { modelId: aiClient.modelId });

      return {
        error: {
          code: 'RATE_LIMITED',
          message: 'AI provider rate limit reached. Please try again in a few minutes.',
          details,
        },
        cause,
      };
    }

    case 'auth': {
      logger.info(`${logPrefix} AI credentials rejected`, {
        modelId: aiClient.modelId,
        usingUserKey: aiClient.usingUserKey,
      });

      if (isUserOwnedEndpoint) {
        if (aiClient.customEndpointId) {
          await markCustomEndpointInvalid({
            userId,
            endpointId: aiClient.customEndpointId,
            errorMessage: CUSTOM_ENDPOINT_REJECTED_ERROR_MESSAGE,
          });
        }

        return { error: { code: 'AI_ERROR', message: CUSTOM_ENDPOINT_REJECTED_ERROR_MESSAGE, details }, cause };
      }

      if (aiClient.usingUserKey) {
        await markApiKeyInvalid({
          userId,
          provider: aiClient.provider,
          errorMessage: INVALID_KEY_ERROR_MESSAGE,
        });
      }

      return { error: { code: 'AI_ERROR', message: INVALID_KEY_ERROR_MESSAGE, details }, cause };
    }

    case 'temporary': {
      logger.info(`${logPrefix} AI provider temporarily unavailable`, { modelId: aiClient.modelId });

      return { error: { code: 'AI_ERROR', message: TEMPORARY_ERROR_MESSAGE, details }, cause };
    }

    default: {
      logger.error({ message: `${logPrefix} AI extraction failed`, error: cause });

      return { error: { code: 'AI_ERROR', message: 'AI extraction failed', details }, cause };
    }
  }
}
