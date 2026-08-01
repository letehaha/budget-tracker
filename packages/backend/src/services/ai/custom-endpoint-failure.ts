// Shared by every AI feature so a dead user endpoint gets the same status and message.

import { AI_PROVIDER } from '@bt/shared/types';

import { getCustomEndpointInfos, markCustomEndpointInvalid } from '../user-settings/ai-custom-endpoint';
import type { AIClientResult } from './ai-client-factory';

/** Not translated: it surfaces in job error lists, where no request locale is available. */
export const CUSTOM_ENDPOINT_UNREACHABLE_ERROR_MESSAGE =
  'Your custom AI endpoint did not respond. Check that the server is running and reachable, then reconnect it in AI settings.';

/**
 * Stored when the endpoint's key ciphertext fails to decrypt (an APPLICATION_JWT_SECRET
 * rotation). The endpoint itself may be perfectly healthy, so the copy points at the key.
 */
export const CUSTOM_ENDPOINT_STORED_KEY_UNREADABLE_ERROR_MESSAGE =
  'The API key stored for this AI endpoint can no longer be read. Re-enter the key in AI settings.';

/** Nothing in the ladder yielded credentials: no key, no endpoint, no server key. */
const NO_AI_CONFIGURED_ERROR_MESSAGE = 'No AI provider configured. Please add an API key in settings.';

/**
 * A user whose every endpoint is flagged down does own credentials, so telling them to add
 * an API key would send them to the wrong screen.
 */
export async function describeMissingAiConfiguration({ userId }: { userId: number }): Promise<string> {
  const endpoints = await getCustomEndpointInfos({ userId });
  const dialable = endpoints.find((endpoint) => endpoint.status !== 'invalid');
  const first = endpoints[0];

  if (!dialable && first) {
    return first.lastError ?? CUSTOM_ENDPOINT_UNREACHABLE_ERROR_MESSAGE;
  }

  return NO_AI_CONFIGURED_ERROR_MESSAGE;
}

export async function markCustomEndpointUnreachable({
  userId,
  aiClient,
}: {
  userId: number;
  aiClient: AIClientResult;
}): Promise<void> {
  if (aiClient.provider !== AI_PROVIDER.custom) return;

  await markCustomEndpointInvalid({
    userId,
    endpointId: aiClient.customEndpointId,
    errorMessage: CUSTOM_ENDPOINT_UNREACHABLE_ERROR_MESSAGE,
  });
}
