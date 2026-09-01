import {
  AIApiKeyStatus,
  AIFeatureConfig,
  AIKeyProvider,
  AI_FEATURE,
  AI_PROVIDER,
  buildCustomModelId,
} from '@bt/shared/types';

import { getDefaultModelForFeature, getProviderFromModelId } from './models-config';

// The one place that decides which model answers an AI feature. The runtime resolver and
// the settings screens both walk this ladder, so what runs and what the UI names cannot
// drift apart.

export function getServerApiKey({ provider }: { provider: AI_PROVIDER }): string | null {
  switch (provider) {
    case AI_PROVIDER.google:
      return process.env.GEMINI_API_KEY || null;
    case AI_PROVIDER.openai:
      return process.env.OPENAI_API_KEY || null;
    case AI_PROVIDER.anthropic:
      return process.env.ANTHROPIC_API_KEY || null;
    case AI_PROVIDER.groq:
      return process.env.GROQ_API_KEY || null;
    case AI_PROVIDER.openrouter:
      return process.env.OPENROUTER_API_KEY || null;
    default:
      return null;
  }
}

export interface LadderEndpoint {
  id: string;
  name: string;
  defaultModel: string;
  status: AIApiKeyStatus;
}

type ResolutionStep<E extends LadderEndpoint> =
  /** An explicit pick is dialled even while the endpoint is flagged invalid, so a recovered
   * server heals itself on the next run. */
  | { kind: 'configured-custom'; endpoint: E; modelId: string }
  | { kind: 'configured-catalog'; provider: AIKeyProvider; modelId: string; usingUserKey: boolean }
  /** No usable config: the feature default model, backed by a user or server key. */
  | { kind: 'default-catalog'; provider: AIKeyProvider; modelId: string; usingUserKey: boolean }
  /** No usable config or key: the first saved endpoint not flagged invalid answers. */
  | { kind: 'fallback-endpoint'; endpoint: E; modelId: string }
  /** The user owns endpoints and every one is flagged down. The run refuses instead of
   * moving their data to a cloud provider they never picked. */
  | { kind: 'all-endpoints-down'; endpoint: E }
  | { kind: 'unserved'; reason: 'invalid-default' | 'no-credentials' };

/**
 * Priority order: explicit feature config, then the feature default on the user's key, then
 * the user's first dialable endpoint, then the feature default on the server key. Pure over
 * its inputs plus the server-key env vars.
 *
 * Pass `excludedEndpointIds` to re-run the walk with an endpoint ruled out.
 */
export function pickResolutionStep<E extends LadderEndpoint>({
  feature,
  config,
  keyProviders,
  endpoints,
  excludedEndpointIds,
}: {
  feature: AI_FEATURE;
  /** Must already be upgraded past retired model IDs. */
  config: AIFeatureConfig | null;
  keyProviders: ReadonlySet<AIKeyProvider>;
  /** In saved order: the first dialable one wins. */
  endpoints: readonly E[];
  excludedEndpointIds?: ReadonlySet<string>;
}): ResolutionStep<E> {
  const excluded = excludedEndpointIds ?? new Set<string>();

  if (config) {
    const provider = getProviderFromModelId({ modelId: config.modelId });

    if (provider === AI_PROVIDER.custom) {
      const endpoint = endpoints.find(
        (candidate) => candidate.id === config.customEndpointId && !excluded.has(candidate.id),
      );
      if (endpoint) {
        return { kind: 'configured-custom', endpoint, modelId: config.modelId };
      }
      // The endpoint was deleted from under the config: fall through to the defaults.
    } else if (provider) {
      if (keyProviders.has(provider)) {
        return { kind: 'configured-catalog', provider, modelId: config.modelId, usingUserKey: true };
      }
      if (getServerApiKey({ provider })) {
        return { kind: 'configured-catalog', provider, modelId: config.modelId, usingUserKey: false };
      }
      // No key anywhere for the configured provider: fall through to the defaults.
    }
    // A null provider means the ID is in no catalog; nothing can serve it, fall through.
  }

  const defaultModelId = getDefaultModelForFeature({ feature });
  const defaultProvider = getProviderFromModelId({ modelId: defaultModelId });

  if (!defaultProvider || defaultProvider === AI_PROVIDER.custom) {
    return { kind: 'unserved', reason: 'invalid-default' };
  }

  if (keyProviders.has(defaultProvider)) {
    return { kind: 'default-catalog', provider: defaultProvider, modelId: defaultModelId, usingUserKey: true };
  }

  const dialable = endpoints.find((candidate) => candidate.status !== 'invalid' && !excluded.has(candidate.id));
  if (dialable) {
    return {
      kind: 'fallback-endpoint',
      endpoint: dialable,
      modelId: buildCustomModelId({ modelName: dialable.defaultModel }),
    };
  }
  if (endpoints.length > 0) {
    return { kind: 'all-endpoints-down', endpoint: endpoints[0]! };
  }

  if (getServerApiKey({ provider: defaultProvider })) {
    return { kind: 'default-catalog', provider: defaultProvider, modelId: defaultModelId, usingUserKey: false };
  }

  return { kind: 'unserved', reason: 'no-credentials' };
}
