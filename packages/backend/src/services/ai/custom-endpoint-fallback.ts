import { AIApiKeyStatus, AICustomEndpointInfo } from '@bt/shared/types';

import { getCustomEndpointInfos } from '../user-settings/ai-custom-endpoint';

/**
 * `settings` is raw JSONB that is never re-parsed on read, so a missing or
 * unrecognised status still counts as dialable.
 */
function isDialable({ status }: { status: AIApiKeyStatus | undefined }): boolean {
  return status !== 'invalid';
}

/**
 * First saved endpoint that is not flagged invalid. Null when the user has no
 * endpoints or all of them are invalid, which leaves the feature on the server key.
 */
export async function resolveFallbackCustomEndpoint({
  userId,
}: {
  userId: number;
}): Promise<AICustomEndpointInfo | null> {
  const endpoints = await getCustomEndpointInfos({ userId });

  return endpoints.find((endpoint) => isDialable({ status: endpoint.status })) ?? null;
}
