import { AIApiKeyStatus, AICustomEndpointInfo } from '@bt/shared/types';

import { getCustomEndpointInfos } from '../user-settings/ai-custom-endpoint';

interface CustomEndpointFallback {
  /** First endpoint worth dialing. Null when the user has none, or every one is flagged down. */
  dialable: AICustomEndpointInfo | null;
  /** First saved endpoint whatever its status, so callers can tell "none saved" from "all down". */
  first: AICustomEndpointInfo | null;
}

/**
 * `settings` is raw JSONB that is never re-parsed on read, so a missing or
 * unrecognised status still counts as dialable.
 */
function isDialable({ status }: { status: AIApiKeyStatus | undefined }): boolean {
  return status !== 'invalid';
}

/**
 * Which of the user's own endpoints can answer a feature that has no config and no key
 * of its own. Both fields are needed downstream: a user who owns endpoints but has none
 * dialable must not be quietly served by the server's cloud key.
 */
export async function resolveFallbackCustomEndpoint({ userId }: { userId: number }): Promise<CustomEndpointFallback> {
  const endpoints = await getCustomEndpointInfos({ userId });

  return {
    dialable: endpoints.find((endpoint) => isDialable({ status: endpoint.status })) ?? null,
    first: endpoints[0] ?? null,
  };
}
