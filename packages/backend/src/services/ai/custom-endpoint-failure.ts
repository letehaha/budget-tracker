// Every AI feature that can run on a user-owned endpoint reports a dead one the same way,
// so the endpoint's status means one thing wherever it was last dialled from.

import { AI_PROVIDER } from '@bt/shared/types';

import { markApiKeyInvalid } from '../user-settings/ai-api-key';
import type { AIClientResult } from './ai-client-factory';
import { isConnectionError, isNonApiResponseError, unwrapRetryError } from './ai-error-classifiers';
import { resolveFallbackCustomEndpoint } from './custom-endpoint-fallback';

/** Reaches the user through job error lists and parser results rather than an HTTP response, so it stays English. */
export const CUSTOM_ENDPOINT_UNREACHABLE_ERROR_MESSAGE =
  'Your custom AI endpoint did not respond. Check that the server is running and reachable, then reconnect it in AI settings.';

/** Nothing in the ladder yielded credentials: no key, no endpoint, no server key. */
const NO_AI_CONFIGURED_ERROR_MESSAGE = 'No AI provider configured. Please add an API key in settings.';

/**
 * True when the user's own endpoint did not answer, or answered with something that is not
 * an API: the server is off, the tunnel to it closed, or the base URL now points elsewhere.
 * Catalog providers are excluded — one dropped connection to a cloud provider is a bad
 * minute, not a broken configuration the user can fix.
 */
export function isCustomEndpointDown({ error, aiClient }: { error: unknown; aiClient: AIClientResult }): boolean {
  if (aiClient.provider !== AI_PROVIDER.custom) return false;

  const cause = unwrapRetryError({ error });

  return isConnectionError({ error: cause }) || isNonApiResponseError({ error: cause });
}

/**
 * Why a feature could not be served, for the callers that only learn `createAIClient`
 * returned null. A user whose every endpoint is flagged down owns credentials, so telling
 * them to add an API key would send them to the wrong screen.
 */
export async function describeMissingAiConfiguration({ userId }: { userId: number }): Promise<string> {
  const { dialable, first } = await resolveFallbackCustomEndpoint({ userId });

  if (!dialable && first) {
    // The stored error names what actually went wrong (server gone, key rejected,
    // model missing); the generic unreachable text only covers legacy rows without one.
    return first.lastError ?? CUSTOM_ENDPOINT_UNREACHABLE_ERROR_MESSAGE;
  }

  return NO_AI_CONFIGURED_ERROR_MESSAGE;
}

/** Flags the endpoint after it failed to answer, so AI settings shows it as down with a way back. */
export async function markCustomEndpointUnreachable({
  userId,
  aiClient,
}: {
  userId: number;
  aiClient: AIClientResult;
}): Promise<void> {
  if (aiClient.provider !== AI_PROVIDER.custom) return;

  await markApiKeyInvalid({
    userId,
    provider: aiClient.provider,
    customEndpointId: aiClient.customEndpointId,
    errorMessage: CUSTOM_ENDPOINT_UNREACHABLE_ERROR_MESSAGE,
  });
}
