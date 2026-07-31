import { getModelNameFromModelId } from '@bt/shared/types';
import { APICallError, RetryError } from 'ai';

// Shared classifiers for AI SDK failures, so every feature reports the same cause
// for the same error.

/** Markers an OpenAI-compatible server puts in a 400/422 body when it does not serve the model. */
const MODEL_NOT_FOUND_MARKERS = ['model_not_found', 'not found', 'does not exist', 'unknown model'];

/**
 * Returns the failure underneath a RetryError. The SDK hides the error that actually
 * ended the call inside it, so classifying the outer error misreads a blocked address
 * or a rejected key. Anything that is not a RetryError is returned untouched.
 */
export function unwrapRetryError({ error }: { error: unknown }): unknown {
  let current = error;

  while (current instanceof RetryError && current.lastError !== undefined) {
    current = current.lastError;
  }

  return current;
}

/** The request hit its deadline, or the caller went away, before an answer arrived. */
export function isAbortError({ error }: { error: unknown }): boolean {
  const cause = unwrapRetryError({ error });
  if (!(cause instanceof Error)) return false;
  return cause.name === 'AbortError' || cause.name === 'TimeoutError';
}

/**
 * True when the request never reached an HTTP server: DNS failure, connection refused,
 * TLS failure or socket timeout. The AI SDK wraps these as an APICallError with no
 * statusCode and `isRetryable: true`, so check this before `isTemporaryError`. A raw
 * `fetch` rejects with a TypeError instead, or an abort-named DOMException on a deadline.
 */
export function isConnectionError({ error }: { error: unknown }): boolean {
  const cause = unwrapRetryError({ error });

  if (isAbortError({ error: cause })) {
    return true;
  }
  if (cause instanceof APICallError) {
    return cause.statusCode === undefined;
  }
  if (cause instanceof TypeError) {
    const message = cause.message.toLowerCase();
    return message.includes('fetch failed') || message.includes('failed to fetch');
  }
  return false;
}

/**
 * True when the endpoint answered but does not serve the requested model: a 404, or a
 * 400/422 whose body names the model as missing (what Ollama and vLLM return for an
 * unpulled model). A 400/422 that only repeats the model name is not enough: names like
 * "v1" or "chat" appear in unrelated error text.
 */
export function isModelNotFoundError({ error }: { error: unknown }): boolean {
  const cause = unwrapRetryError({ error });

  if (!(cause instanceof APICallError)) return false;
  if (cause.statusCode === 404) return true;
  if (cause.statusCode !== 400 && cause.statusCode !== 422) return false;

  const message = cause.message.toLowerCase();
  return MODEL_NOT_FOUND_MARKERS.some((marker) => message.includes(marker));
}

/** Reaches the user through job error lists rather than an HTTP response, so it stays English. */
export function buildModelNotServedMessage({ modelId }: { modelId: string }): string {
  return `The AI model "${getModelNameFromModelId({ modelId })}" is not available on the configured AI endpoint. Please update the model name in AI settings.`;
}
