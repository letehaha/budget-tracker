import { AI_PROVIDER } from '@bt/shared/types';

/**
 * Ceiling for one call to a user-owned endpoint. Local models can legitimately take
 * minutes on a big prompt, but a dead tunnel must not hold a job open forever.
 */
const CUSTOM_ENDPOINT_CALL_TIMEOUT_MS = 5 * 60 * 1000;

/** Ceiling for one call to a catalog provider, covering the SDK's internal retry backoff. */
const CATALOG_CALL_TIMEOUT_MS = 10 * 60 * 1000;

/** Matches the `ai` SDK's own default. */
const CATALOG_MAX_RETRIES = 2;

/**
 * Per-call safety limits for `generateText`/`generateObject`. The signal is fresh per call,
 * because sharing one would let a single slow request abort every call created with it.
 *
 * Custom endpoints get `maxRetries: 0`: retrying a user endpoint that is down only
 * multiplies the time the job hangs before it reports the endpoint dead.
 */
export function aiCallGuards({ provider }: { provider: AI_PROVIDER }): {
  abortSignal: AbortSignal;
  maxRetries: number;
} {
  if (provider === AI_PROVIDER.custom) {
    return { abortSignal: AbortSignal.timeout(CUSTOM_ENDPOINT_CALL_TIMEOUT_MS), maxRetries: 0 };
  }

  return { abortSignal: AbortSignal.timeout(CATALOG_CALL_TIMEOUT_MS), maxRetries: CATALOG_MAX_RETRIES };
}
