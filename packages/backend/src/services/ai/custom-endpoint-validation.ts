import { AI_CUSTOM_MODEL_PREFIX, AI_PROVIDER } from '@bt/shared/types';
import { assertSafeOutboundUrl, createGuardedFetch } from '@common/utils/url-guard';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import { logger } from '@js/utils/logger';
import { generateText } from 'ai';

import { createAIClientWithConfig } from './ai-client-factory';
import { isAbortError, isConnectionError, isModelNotFoundError, unwrapRetryError } from './ai-error-classifiers';
import { VALIDATION_PROMPT, isAuthError, isTemporaryError } from './api-key-validation';

interface APIKeyValidationResult {
  isValid: boolean;
  error?: string;
}

/** Ceiling for the whole probe. Stops an endpoint that connects then trickles data slowly from holding the request open. */
const VALIDATION_TIMEOUT_MS = 15_000;

/**
 * Ceiling for the model-list read. `/models` is a static lookup, so a server silent this long
 * will not return a list. Hitting it is not a verdict: the generate probe takes over.
 */
const MODEL_LIST_TIMEOUT_MS = 5_000;

/** How many of the endpoint's own model ids get quoted back when the requested one is missing. */
const MAX_LISTED_MODELS_IN_ERROR = 5;

/**
 * What `GET <baseUrl>/models` told us. `unusable` covers every answer that is not a readable
 * list (404, non-JSON body, unrecognised shape, empty list) and is not a verdict on the endpoint.
 */
type ServedModelsOutcome =
  | { kind: 'listed'; modelIds: string[] }
  | { kind: 'unreachable'; cause: unknown }
  | { kind: 'authFailed'; status: number }
  | { kind: 'unusable' };

/** Pulls the ids out of an OpenAI-style `{ data: [{ id }] }` body, tolerating anything else. */
export function readModelIds({ body }: { body: unknown }): string[] {
  if (typeof body !== 'object' || body === null) return [];

  const { data } = body as { data?: unknown };
  if (!Array.isArray(data)) return [];

  return data
    .map((entry) => (typeof entry === 'object' && entry !== null ? (entry as { id?: unknown }).id : undefined))
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

/** Reads the endpoint's own model catalogue, classifying anything unreadable as `unusable`. */
async function fetchServedModels({
  baseUrl,
  apiKey,
}: {
  baseUrl: string;
  apiKey: string | null;
}): Promise<ServedModelsOutcome> {
  const guardedFetch = createGuardedFetch();
  const url = `${baseUrl.replace(/\/+$/, '')}/models`;

  let response: Response;
  try {
    response = await guardedFetch(url, {
      method: 'GET',
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS),
    });
  } catch (error) {
    // A blocked URL or refused redirect is a bad request from the user, not a bad endpoint
    if (error instanceof ValidationError) {
      throw error;
    }

    // A server too busy to list models can still answer a generate call, so the probe continues.
    if (isAbortError({ error })) {
      logger.info('Custom AI endpoint model list timed out', { baseUrl, error });
      return { kind: 'unusable' };
    }

    if (isConnectionError({ error })) {
      return { kind: 'unreachable', cause: error };
    }

    logger.info('Custom AI endpoint model list request failed', { baseUrl, error });
    return { kind: 'unusable' };
  }

  if (response.status === 401 || response.status === 403) {
    return { kind: 'authFailed', status: response.status };
  }

  if (!response.ok) {
    return { kind: 'unusable' };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    logger.info('Custom AI endpoint model list is not readable JSON', { baseUrl, error });
    return { kind: 'unusable' };
  }

  const modelIds = readModelIds({ body });
  return modelIds.length > 0 ? { kind: 'listed', modelIds } : { kind: 'unusable' };
}

/**
 * Ids worth showing next to a rejected model name. Prefix matches come first: a truncated or
 * mistyped name is the usual cause. Aggregators list hundreds, hence the cap and remainder count.
 */
export function pickListedModelsToShow({ modelName, modelIds }: { modelName: string; modelIds: string[] }): {
  shown: string[];
  remaining: number;
} {
  const typed = modelName.toLowerCase();
  const related = modelIds.filter((id) => {
    const candidate = id.toLowerCase();
    return candidate.startsWith(typed) || typed.startsWith(candidate);
  });
  const ordered = [...related, ...modelIds.filter((id) => !related.includes(id))];

  return {
    shown: ordered.slice(0, MAX_LISTED_MODELS_IN_ERROR),
    remaining: Math.max(ordered.length - MAX_LISTED_MODELS_IN_ERROR, 0),
  };
}

/** Names the rejected model and the ids the endpoint actually offers. */
function buildModelNotListedMessage({ modelName, modelIds }: { modelName: string; modelIds: string[] }): string {
  const { shown, remaining } = pickListedModelsToShow({ modelName, modelIds });
  const parts = [...shown];

  if (remaining > 0) {
    parts.push(t({ key: 'ai.customEndpointMoreModels', variables: { count: remaining } }));
  }

  return t({
    key: 'ai.customEndpointModelNotListed',
    variables: { model: modelName, available: parts.join(', ') },
  });
}

/**
 * Validates a user-supplied OpenAI-compatible endpoint.
 *
 * A readable `/models` catalogue decides the verdict. LM Studio answers a chat completion with
 * whatever model is loaded and ignores the `model` field, so a generate call there accepts a
 * mistyped name. An exact match in the list is enough on its own: reading the list already proved
 * the endpoint reachable and the key accepted, and a listed-but-unloaded model triggers a
 * just-in-time load that outlasts the generate deadline. Servers without `/models` fall through
 * to the generate probe.
 *
 * The outbound guard runs here; the guarded fetch inside the client re-checks per request.
 */
export async function validateCustomEndpoint({
  baseUrl,
  modelName,
  apiKey,
}: {
  baseUrl: string;
  modelName: string;
  apiKey: string | null;
}): Promise<APIKeyValidationResult> {
  await assertSafeOutboundUrl({ url: baseUrl });

  const servedModels = await fetchServedModels({ baseUrl, apiKey });

  if (servedModels.kind === 'unreachable') {
    logger.info('Custom AI endpoint unreachable', { baseUrl, modelName, error: servedModels.cause });
    return { isValid: false, error: t({ key: 'ai.customEndpointUnreachable' }) };
  }

  if (servedModels.kind === 'authFailed') {
    logger.info('Custom AI endpoint rejected the API key', { baseUrl, modelName, status: servedModels.status });
    return { isValid: false, error: t({ key: 'ai.customEndpointAuthFailed' }) };
  }

  if (servedModels.kind === 'listed') {
    if (servedModels.modelIds.includes(modelName)) {
      return { isValid: true };
    }

    logger.info('Custom AI endpoint does not list the requested model', { baseUrl, modelName });
    return { isValid: false, error: buildModelNotListedMessage({ modelName, modelIds: servedModels.modelIds }) };
  }

  try {
    const model = createAIClientWithConfig({
      provider: AI_PROVIDER.custom,
      modelId: `${AI_CUSTOM_MODEL_PREFIX}${modelName}`,
      apiKey,
      baseUrl,
    });

    await generateText({
      model,
      prompt: VALIDATION_PROMPT,
      maxOutputTokens: 5,
      // First response is the verdict, and the SDK's retry backoff would make the user wait out
      // sleeps on a 429.
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
    });

    return { isValid: true };
  } catch (error) {
    const cause = unwrapRetryError({ error });

    // A blocked URL or refused redirect is a bad request from the user, not a bad endpoint
    if (cause instanceof ValidationError) {
      throw cause;
    }

    if (isConnectionError({ error: cause })) {
      logger.info('Custom AI endpoint unreachable', { baseUrl, modelName, error: cause });
      return { isValid: false, error: t({ key: 'ai.customEndpointUnreachable' }) };
    }

    if (isAuthError(cause)) {
      logger.info('Custom AI endpoint rejected the API key', { baseUrl, modelName, error: cause });
      return { isValid: false, error: t({ key: 'ai.customEndpointAuthFailed' }) };
    }

    if (isModelNotFoundError({ error: cause })) {
      logger.info('Custom AI endpoint does not serve the requested model', { baseUrl, modelName, error: cause });
      return { isValid: false, error: t({ key: 'ai.customEndpointModelNotFound', variables: { model: modelName } }) };
    }

    if (isTemporaryError(cause)) {
      // Reachable and authenticated, just busy. Logged because this is the one path that stores
      // `valid` without proof.
      logger.info('Custom AI endpoint accepted despite a temporary error', { baseUrl, modelName, error: cause });
      return { isValid: true };
    }

    logger.info('Custom AI endpoint validation failed', { baseUrl, modelName, error: cause });
    return { isValid: false, error: t({ key: 'ai.customEndpointValidationFailed' }) };
  }
}
