import { randomUUID } from 'node:crypto';

// Frozen snapshot of the AI catalog when per-provider keys and custom endpoints were folded
// into connections. Runs from `src/migrations` in the prod image, so it must not import app
// code or `@bt/shared`: only the literals below.

const FEATURES = ['categorization', 'statement_parsing', 'investment_transactions_parsing', 'receipt_parsing'] as const;
type Feature = (typeof FEATURES)[number];

const KEY_PROVIDERS = ['openai', 'anthropic', 'google', 'groq'] as const;
type KeyProvider = (typeof KEY_PROVIDERS)[number];

const LIVE_MODEL_IDS: ReadonlySet<string> = new Set([
  'openai/gpt-5.6-sol',
  'openai/gpt-5.6-terra',
  'openai/gpt-5.6-luna',
  'openai/gpt-5.4-nano',
  'anthropic/claude-opus-5',
  'anthropic/claude-sonnet-5',
  'anthropic/claude-haiku-4-5',
  'google/gemini-3.1-pro-preview',
  'google/gemini-3.8-flash',
  'google/gemini-3.5-flash-lite',
  'google/gemma-4-31b-it',
  'groq/openai/gpt-oss-120b',
  'groq/openai/gpt-oss-20b',
  'groq/llama-3.3-70b-versatile',
]);

const RETIRED_MODELS: ReadonlyMap<string, string> = new Map([
  ['openai/gpt-4o', 'openai/gpt-5.6-terra'],
  ['openai/gpt-4-turbo', 'openai/gpt-5.6-terra'],
  ['openai/gpt-4o-mini', 'openai/gpt-5.4-nano'],
  ['anthropic/claude-3-5-haiku-latest', 'anthropic/claude-haiku-4-5'],
  ['anthropic/claude-3-7-sonnet-latest', 'anthropic/claude-sonnet-5'],
  ['anthropic/claude-opus-4-5', 'anthropic/claude-opus-5'],
  ['anthropic/claude-sonnet-4-5', 'anthropic/claude-sonnet-5'],
  ['google/gemini-3-pro-preview', 'google/gemini-3.1-pro-preview'],
  ['google/gemini-3-flash-preview', 'google/gemini-3.8-flash'],
  ['google/gemini-2.5-pro', 'google/gemini-3.1-pro-preview'],
  ['google/gemini-2.5-flash', 'google/gemini-3.8-flash'],
  ['google/gemini-3.6-flash', 'google/gemini-3.8-flash'],
  ['google/gemini-2.5-flash-lite', 'google/gemini-3.5-flash-lite'],
  ['groq/mixtral-8x7b-32768', 'groq/openai/gpt-oss-20b'],
  ['groq/llama-3.1-8b-instant', 'groq/openai/gpt-oss-20b'],
]);

const FEATURE_DEFAULTS: Readonly<Record<Feature, string>> = {
  categorization: 'google/gemma-4-31b-it',
  statement_parsing: 'google/gemini-3.8-flash',
  investment_transactions_parsing: 'google/gemini-3.8-flash',
  receipt_parsing: 'google/gemini-3.5-flash-lite',
};

/** Model for a key no feature uses: the provider's first pick in the categorization recommendations. */
const UNUSED_KEY_MODEL_IDS: Readonly<Record<KeyProvider, string>> = {
  google: 'google/gemma-4-31b-it',
  groq: 'groq/openai/gpt-oss-20b',
  openai: 'openai/gpt-5.4-nano',
  anthropic: 'anthropic/claude-haiku-4-5',
};

const PROVIDER_LABELS: Readonly<Record<KeyProvider, string>> = {
  openai: 'OpenAI',
  anthropic: 'Claude',
  google: 'Gemini',
  groq: 'Groq',
};

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const CUSTOM_MODEL_PREFIX = 'custom/';
const NAME_MAX_LENGTH = 50;
const LEGACY_AI_KEYS = ['apiKeys', 'defaultProvider', 'customEndpoints'];

type Json = Record<string, unknown>;

export interface UnifiedAiConnection {
  id: string;
  provider: 'openai' | 'anthropic' | 'google' | 'custom';
  name: string;
  baseUrl?: string;
  keyEncrypted?: string;
  model: string;
  createdAt: string;
  status: 'valid' | 'invalid';
  lastValidatedAt: string;
  lastError?: string;
  invalidatedAt?: string;
}

interface LegacyEndpoint extends Json {
  id: string;
  name: string;
  baseUrl: string;
  defaultModel: string;
}

type OldLadderStep =
  | { kind: 'endpoint'; endpoint: LegacyEndpoint; model: string }
  | { kind: 'key'; provider: KeyProvider; modelId: string }
  | { kind: 'server' }
  /** First dialable endpoint answers automatically, or every endpoint is down and the run refuses. */
  | { kind: 'unconfigured' };

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const asArray = ({ value }: { value: unknown }): unknown[] => (Array.isArray(value) ? value : []);
const isFeature = (value: unknown): value is Feature => FEATURES.includes(value as Feature);
const isKeyProvider = (value: unknown): value is KeyProvider => KEY_PROVIDERS.includes(value as KeyProvider);
const providerOf = ({ modelId }: { modelId: string }) => modelId.slice(0, modelId.indexOf('/')) as KeyProvider;

function isLegacyAi({ ai }: { ai: Json }): boolean {
  return (
    LEGACY_AI_KEYS.some((key) => key in ai) ||
    asArray({ value: ai.featureConfigs }).some((config) => !isObject(config) || !('connectionId' in config))
  );
}

function resolveLiveModelId({ modelId, feature }: { modelId: string; feature: Feature }): string {
  if (LIVE_MODEL_IDS.has(modelId)) return modelId;
  return RETIRED_MODELS.get(modelId) ?? FEATURE_DEFAULTS[feature];
}

/** What the pre-connections resolution ladder served, assuming the server key was allowed. */
function pickOldLadderStep({
  feature,
  config,
  keys,
  endpoints,
}: {
  feature: Feature;
  config: Json | undefined;
  keys: ReadonlyMap<KeyProvider, Json>;
  endpoints: readonly LegacyEndpoint[];
}): OldLadderStep {
  if (config && typeof config.modelId === 'string') {
    if (config.modelId.startsWith(CUSTOM_MODEL_PREFIX)) {
      const endpoint = endpoints.find((candidate) => candidate.id === config.customEndpointId);
      if (endpoint) return { kind: 'endpoint', endpoint, model: config.modelId.slice(CUSTOM_MODEL_PREFIX.length) };
    } else {
      const modelId = resolveLiveModelId({ modelId: config.modelId, feature });
      const provider = providerOf({ modelId });
      if (keys.has(provider)) return { kind: 'key', provider, modelId };
      if (modelId === FEATURE_DEFAULTS[feature]) return { kind: 'server' };
    }
  }

  const defaultModelId = FEATURE_DEFAULTS[feature];
  const defaultProvider = providerOf({ modelId: defaultModelId });
  if (keys.has(defaultProvider)) return { kind: 'key', provider: defaultProvider, modelId: defaultModelId };
  if (endpoints.length > 0) return { kind: 'unconfigured' };
  return { kind: 'server' };
}

function toConnection({
  id,
  provider,
  name,
  baseUrl,
  model,
  source,
}: {
  id: string;
  provider: UnifiedAiConnection['provider'];
  name: string;
  baseUrl?: string;
  model: string;
  source: Json;
}): UnifiedAiConnection {
  const createdAt = typeof source.createdAt === 'string' ? source.createdAt : new Date().toISOString();
  const connection: UnifiedAiConnection = {
    id,
    provider,
    name,
    model,
    createdAt,
    status: source.status === 'invalid' ? 'invalid' : 'valid',
    lastValidatedAt: typeof source.lastValidatedAt === 'string' ? source.lastValidatedAt : createdAt,
  };
  if (baseUrl) connection.baseUrl = baseUrl;
  if (typeof source.keyEncrypted === 'string') connection.keyEncrypted = source.keyEncrypted;
  if (typeof source.lastError === 'string') connection.lastError = source.lastError;
  if (typeof source.invalidatedAt === 'string') connection.invalidatedAt = source.invalidatedAt;
  return connection;
}

function claimUniqueName({ base, used }: { base: string; used: Set<string> }): string {
  for (let attempt = 1; ; attempt++) {
    const suffix = attempt === 1 ? '' : ` ${attempt}`;
    const name = base.slice(0, NAME_MAX_LENGTH - suffix.length) + suffix;
    if (!used.has(name.toLowerCase())) {
      used.add(name.toLowerCase());
      return name;
    }
  }
}

/**
 * Converts legacy `ai.apiKeys` / `ai.customEndpoints` / `{ modelId, customEndpointId }` feature
 * configs into `ai.connections` + `{ feature, connectionId }` configs, keeping every feature on
 * the model the old ladder served. Returns the input itself when there is nothing to convert
 * (idempotent) or the shape is unexpected; never throws.
 */
export function unifyAiConnections({ settings }: { settings: unknown }): unknown {
  if (!isObject(settings) || !isObject(settings.ai) || !isLegacyAi({ ai: settings.ai })) return settings;

  const { apiKeys, defaultProvider, customEndpoints, featureConfigs, ...restAi } = settings.ai;

  const keys = new Map<KeyProvider, Json>();
  for (const key of asArray({ value: apiKeys })) {
    if (
      isObject(key) &&
      isKeyProvider(key.provider) &&
      typeof key.keyEncrypted === 'string' &&
      !keys.has(key.provider)
    ) {
      keys.set(key.provider, key);
    }
  }

  const endpoints = asArray({ value: customEndpoints }).filter(
    (endpoint): endpoint is LegacyEndpoint =>
      isObject(endpoint) &&
      typeof endpoint.id === 'string' &&
      typeof endpoint.name === 'string' &&
      typeof endpoint.baseUrl === 'string' &&
      typeof endpoint.defaultModel === 'string',
  );

  const configs = new Map<Feature, Json>();
  for (const config of asArray({ value: featureConfigs })) {
    if (isObject(config) && isFeature(config.feature) && !configs.has(config.feature)) {
      configs.set(config.feature, config);
    }
  }

  const steps = FEATURES.map((feature) => ({
    feature,
    step: pickOldLadderStep({ feature, config: configs.get(feature), keys, endpoints }),
  }));

  const connections = endpoints.map((endpoint) =>
    toConnection({
      id: endpoint.id,
      provider: 'custom',
      name: endpoint.name,
      baseUrl: endpoint.baseUrl,
      model: endpoint.defaultModel,
      source: endpoint,
    }),
  );
  const assignments = new Map<Feature, string | null>();

  const cloneIds = new Map<string, string>();
  for (const { feature, step } of steps) {
    if (step.kind === 'server') assignments.set(feature, null);
    if (step.kind !== 'endpoint') continue;

    const { endpoint, model } = step;
    if (model === endpoint.defaultModel) {
      assignments.set(feature, endpoint.id);
      continue;
    }

    const cloneKey = JSON.stringify([endpoint.id, model]);
    let cloneId = cloneIds.get(cloneKey);
    if (!cloneId) {
      cloneId = randomUUID();
      cloneIds.set(cloneKey, cloneId);
      connections.push(
        toConnection({
          id: cloneId,
          provider: 'custom',
          name: `${endpoint.name} ${model}`,
          baseUrl: endpoint.baseUrl,
          model,
          source: endpoint,
        }),
      );
    }
    assignments.set(feature, cloneId);
  }

  // The old explicit default provider first, the rest keep `apiKeys` order.
  const orderedKeys = [
    ...Array.from(keys).filter(([provider]) => provider === defaultProvider),
    ...Array.from(keys).filter(([provider]) => provider !== defaultProvider),
  ];
  for (const [provider, key] of orderedKeys) {
    const served = steps.flatMap(({ feature, step }) =>
      step.kind === 'key' && step.provider === provider ? [{ feature, modelId: step.modelId }] : [],
    );
    const modelIds = Array.from(new Set(served.map(({ modelId }) => modelId)));
    if (modelIds.length === 0) modelIds.push(UNUSED_KEY_MODEL_IDS[provider]);

    for (const modelId of modelIds) {
      const id = randomUUID();
      const model = modelId.slice(provider.length + 1);
      const label = PROVIDER_LABELS[provider];
      connections.push(
        toConnection({
          id,
          provider: provider === 'groq' ? 'custom' : provider,
          name: modelIds.length === 1 ? label : `${label} ${model}`,
          baseUrl: provider === 'groq' ? GROQ_BASE_URL : undefined,
          model,
          source: key,
        }),
      );
      for (const entry of served) {
        if (entry.modelId === modelId) assignments.set(entry.feature, id);
      }
    }
  }

  const usedNames = new Set<string>();
  for (const connection of connections) {
    connection.name = claimUniqueName({ base: connection.name, used: usedNames });
  }

  // A server pin only matters once the user owns a connection: without one the new ladder
  // already falls through to the server model.
  const nextFeatureConfigs = FEATURES.flatMap((feature) => {
    const connectionId = assignments.get(feature);
    if (connectionId === undefined || (connectionId === null && connections.length === 0)) return [];
    return [{ feature, connectionId }];
  });

  return { ...settings, ai: { ...restAi, featureConfigs: nextFeatureConfigs, connections } };
}
