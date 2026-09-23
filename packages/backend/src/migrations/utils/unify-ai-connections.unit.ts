import { describe, expect, it } from '@jest/globals';

import { type UnifiedAiConnection, unifyAiConnections } from './unify-ai-connections';

const CREATED = '2026-01-01T00:00:00.000Z';
const VALIDATED = '2026-02-01T00:00:00.000Z';
const INVALIDATED = '2026-03-01T00:00:00.000Z';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Feature = 'categorization' | 'statement_parsing' | 'investment_transactions_parsing' | 'receipt_parsing';

interface Result {
  locale: string;
  ai: {
    connections: UnifiedAiConnection[];
    featureConfigs: { feature: Feature; connectionId: string | null }[];
    customInstructions?: string;
  };
}

const key = ({ provider, ...extra }: { provider: string } & Record<string, unknown>) => ({
  provider,
  keyEncrypted: `cipher-${provider}`,
  createdAt: CREATED,
  ...extra,
});

const endpoint = ({ id, ...extra }: { id: string } & Record<string, unknown>) => ({
  id,
  name: `Endpoint ${id}`,
  baseUrl: `https://${id}.example.com/v1`,
  defaultModel: 'llama3.2',
  createdAt: CREATED,
  status: 'valid',
  lastValidatedAt: VALIDATED,
  ...extra,
});

const customConfig = ({ feature, endpointId, model }: { feature: Feature; endpointId: string; model: string }) => ({
  feature,
  modelId: `custom/${model}`,
  customEndpointId: endpointId,
});

const convert = ({ ai }: { ai: Record<string, unknown> }) =>
  unifyAiConnections({ settings: { locale: 'en', ai } }) as Result;

const pinOf = ({ result, feature }: { result: Result; feature: Feature }) =>
  result.ai.featureConfigs.find((config) => config.feature === feature)?.connectionId;

const named = ({ result, name }: { result: Result; name: string }) => {
  const connection = result.ai.connections.find((candidate) => candidate.name === name);
  if (!connection) throw new Error(`No connection named "${name}"`);
  return connection;
};

describe('unifyAiConnections', () => {
  it('turns a lone Google key into one Gemini connection per distinct feature default', () => {
    const result = convert({
      ai: { apiKeys: [key({ provider: 'google' })], defaultProvider: 'google', featureConfigs: [] },
    });

    expect(result.ai).not.toHaveProperty('apiKeys');
    expect(result.ai).not.toHaveProperty('defaultProvider');
    expect(result.ai).not.toHaveProperty('customEndpoints');
    expect(result.ai.connections.map(({ name }) => name)).toEqual([
      'Gemini gemma-4-31b-it',
      'Gemini gemini-3.8-flash',
      'Gemini gemini-3.5-flash-lite',
    ]);

    const gemma = named({ result, name: 'Gemini gemma-4-31b-it' });
    expect(gemma).toEqual({
      id: expect.stringMatching(UUID),
      provider: 'google',
      name: 'Gemini gemma-4-31b-it',
      model: 'gemma-4-31b-it',
      keyEncrypted: 'cipher-google',
      createdAt: CREATED,
      status: 'valid',
      lastValidatedAt: CREATED,
    });
    expect(gemma).not.toHaveProperty('baseUrl');

    const flash = named({ result, name: 'Gemini gemini-3.8-flash' });
    expect(result.ai.featureConfigs).toEqual([
      { feature: 'categorization', connectionId: gemma.id },
      { feature: 'statement_parsing', connectionId: flash.id },
      { feature: 'investment_transactions_parsing', connectionId: flash.id },
      { feature: 'receipt_parsing', connectionId: named({ result, name: 'Gemini gemini-3.5-flash-lite' }).id },
    ]);
  });

  it('gives an Anthropic key one connection per configured model and pins the rest to the server model', () => {
    const result = convert({
      ai: {
        apiKeys: [
          key({ provider: 'anthropic', status: 'invalid', lastError: 'Key rejected', invalidatedAt: INVALIDATED }),
        ],
        featureConfigs: [
          { feature: 'receipt_parsing', modelId: 'anthropic/claude-sonnet-5' },
          { feature: 'categorization', modelId: 'anthropic/claude-haiku-4-5' },
        ],
      },
    });

    // Within a provider, models follow feature order, not config order.
    expect(result.ai.connections.map(({ name }) => name)).toEqual([
      'Claude claude-haiku-4-5',
      'Claude claude-sonnet-5',
    ]);
    expect(named({ result, name: 'Claude claude-sonnet-5' })).toMatchObject({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      keyEncrypted: 'cipher-anthropic',
      status: 'invalid',
      lastError: 'Key rejected',
      invalidatedAt: INVALIDATED,
    });
    expect(result.ai.featureConfigs).toEqual([
      { feature: 'categorization', connectionId: named({ result, name: 'Claude claude-haiku-4-5' }).id },
      { feature: 'statement_parsing', connectionId: null },
      { feature: 'investment_transactions_parsing', connectionId: null },
      { feature: 'receipt_parsing', connectionId: named({ result, name: 'Claude claude-sonnet-5' }).id },
    ]);
  });

  it('names a provider with a single model by its bare label', () => {
    const result = convert({
      ai: {
        apiKeys: [key({ provider: 'openai' })],
        featureConfigs: [
          { feature: 'categorization', modelId: 'openai/gpt-5.6-luna' },
          { feature: 'receipt_parsing', modelId: 'openai/gpt-5.6-luna' },
        ],
      },
    });

    expect(result.ai.connections).toHaveLength(1);
    expect(result.ai.connections[0]).toMatchObject({ name: 'OpenAI', provider: 'openai', model: 'gpt-5.6-luna' });
    expect(pinOf({ result, feature: 'receipt_parsing' })).toBe(result.ai.connections[0]!.id);
  });

  it('keeps endpoints and clones one per (endpoint, model) override, copying validation state', () => {
    const result = convert({
      ai: {
        apiKeys: [],
        customEndpoints: [
          endpoint({ id: 'e1', keyEncrypted: 'cipher-e1' }),
          endpoint({
            id: 'e2',
            defaultModel: 'mistral',
            status: 'invalid',
            lastError: 'Down',
            invalidatedAt: INVALIDATED,
          }),
        ],
        featureConfigs: [
          customConfig({ feature: 'categorization', endpointId: 'e1', model: 'llama3.2' }),
          customConfig({ feature: 'statement_parsing', endpointId: 'e1', model: 'qwen3' }),
          customConfig({ feature: 'investment_transactions_parsing', endpointId: 'e1', model: 'qwen3' }),
          customConfig({ feature: 'receipt_parsing', endpointId: 'e2', model: 'phi4' }),
        ],
      },
    });

    expect(result.ai.connections.map(({ name }) => name)).toEqual([
      'Endpoint e1',
      'Endpoint e2',
      'Endpoint e1 qwen3',
      'Endpoint e2 phi4',
    ]);
    expect(result.ai.connections[0]).toEqual({
      id: 'e1',
      provider: 'custom',
      name: 'Endpoint e1',
      baseUrl: 'https://e1.example.com/v1',
      keyEncrypted: 'cipher-e1',
      model: 'llama3.2',
      createdAt: CREATED,
      status: 'valid',
      lastValidatedAt: VALIDATED,
    });
    expect(result.ai.connections[1]).not.toHaveProperty('keyEncrypted');

    const qwen = named({ result, name: 'Endpoint e1 qwen3' });
    expect(qwen).toEqual({
      id: expect.stringMatching(UUID),
      provider: 'custom',
      name: 'Endpoint e1 qwen3',
      baseUrl: 'https://e1.example.com/v1',
      keyEncrypted: 'cipher-e1',
      model: 'qwen3',
      createdAt: CREATED,
      status: 'valid',
      lastValidatedAt: VALIDATED,
    });

    const phi = named({ result, name: 'Endpoint e2 phi4' });
    expect(phi).toMatchObject({
      baseUrl: 'https://e2.example.com/v1',
      model: 'phi4',
      status: 'invalid',
      lastError: 'Down',
      invalidatedAt: INVALIDATED,
    });

    expect(result.ai.featureConfigs).toEqual([
      { feature: 'categorization', connectionId: 'e1' },
      { feature: 'statement_parsing', connectionId: qwen.id },
      { feature: 'investment_transactions_parsing', connectionId: qwen.id },
      { feature: 'receipt_parsing', connectionId: phi.id },
    ]);
  });

  it('leaves features unconfigured when the first dialable endpoint answered them automatically', () => {
    const result = convert({
      ai: {
        apiKeys: [],
        customEndpoints: [endpoint({ id: 'e1', status: 'invalid' }), endpoint({ id: 'e2' })],
        featureConfigs: [],
      },
    });

    expect(result.ai.connections.map(({ id }) => id)).toEqual(['e1', 'e2']);
    expect(result.ai.featureConfigs).toEqual([]);
  });

  it('never pins the server model when every endpoint is down, except for an explicit default pick', () => {
    const result = convert({
      ai: {
        apiKeys: [],
        customEndpoints: [endpoint({ id: 'e1', status: 'invalid' })],
        featureConfigs: [{ feature: 'categorization', modelId: 'google/gemma-4-31b-it' }],
      },
    });

    expect(result.ai.featureConfigs).toEqual([{ feature: 'categorization', connectionId: null }]);
  });

  it('falls through to the defaults when a custom config points at a deleted endpoint', () => {
    const result = convert({
      ai: {
        apiKeys: [key({ provider: 'google' })],
        customEndpoints: [endpoint({ id: 'e1' })],
        featureConfigs: [customConfig({ feature: 'categorization', endpointId: 'gone', model: 'qwen3' })],
      },
    });

    expect(pinOf({ result, feature: 'categorization' })).toBe(named({ result, name: 'Gemini gemma-4-31b-it' }).id);
    expect(result.ai.connections.some(({ model }) => model === 'qwen3')).toBe(false);
  });

  it('moves a Groq key onto a custom connection at the Groq base URL', () => {
    const result = convert({
      ai: {
        apiKeys: [key({ provider: 'groq' })],
        featureConfigs: [
          { feature: 'categorization', modelId: 'groq/openai/gpt-oss-120b' },
          { feature: 'statement_parsing', modelId: 'groq/mixtral-8x7b-32768' },
        ],
      },
    });

    expect(result.ai.connections).toEqual([
      expect.objectContaining({
        provider: 'custom',
        name: 'Groq openai/gpt-oss-120b',
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'openai/gpt-oss-120b',
        keyEncrypted: 'cipher-groq',
      }),
      expect.objectContaining({
        provider: 'custom',
        name: 'Groq openai/gpt-oss-20b',
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'openai/gpt-oss-20b',
      }),
    ]);
    expect(pinOf({ result, feature: 'statement_parsing' })).toBe(named({ result, name: 'Groq openai/gpt-oss-20b' }).id);
    expect(pinOf({ result, feature: 'receipt_parsing' })).toBeNull();
  });

  it('upgrades retired ids and sends unknown ids to the feature default, like the runtime did', () => {
    const result = convert({
      ai: {
        apiKeys: [key({ provider: 'openai' })],
        featureConfigs: [
          { feature: 'categorization', modelId: 'openai/gpt-4o' },
          // Unknown id → Gemini default; no Google key → the server model.
          { feature: 'statement_parsing', modelId: 'openai/gpt-3.5-turbo' },
          // Retired → claude-sonnet-5, not a default, no Anthropic key → falls through to the server.
          { feature: 'investment_transactions_parsing', modelId: 'anthropic/claude-3-7-sonnet-latest' },
        ],
      },
    });

    expect(result.ai.connections).toEqual([expect.objectContaining({ name: 'OpenAI', model: 'gpt-5.6-terra' })]);
    expect(result.ai.featureConfigs).toEqual([
      { feature: 'categorization', connectionId: result.ai.connections[0]!.id },
      { feature: 'statement_parsing', connectionId: null },
      { feature: 'investment_transactions_parsing', connectionId: null },
      { feature: 'receipt_parsing', connectionId: null },
    ]);
  });

  it('upgrades the retired gemini-3.6-flash default on the Google key', () => {
    const result = convert({
      ai: {
        apiKeys: [key({ provider: 'google' })],
        featureConfigs: [{ feature: 'categorization', modelId: 'google/gemini-3.6-flash' }],
      },
    });

    expect(pinOf({ result, feature: 'categorization' })).toBe(named({ result, name: 'Gemini gemini-3.8-flash' }).id);
  });

  it('treats Object.prototype names as unknown ids', () => {
    const result = convert({
      ai: {
        apiKeys: [key({ provider: 'google' })],
        featureConfigs: [
          { feature: 'categorization', modelId: 'constructor' },
          { feature: 'statement_parsing', modelId: '__proto__' },
        ],
      },
    });

    expect(pinOf({ result, feature: 'categorization' })).toBe(named({ result, name: 'Gemini gemma-4-31b-it' }).id);
    expect(pinOf({ result, feature: 'statement_parsing' })).toBe(named({ result, name: 'Gemini gemini-3.8-flash' }).id);
  });

  it('serves an unknown id on the Google key when the user has one', () => {
    const result = convert({
      ai: {
        apiKeys: [key({ provider: 'openai' }), key({ provider: 'google' })],
        featureConfigs: [{ feature: 'statement_parsing', modelId: 'openai/gpt-3.5-turbo' }],
      },
    });

    expect(pinOf({ result, feature: 'statement_parsing' })).toBe(named({ result, name: 'Gemini gemini-3.8-flash' }).id);
  });

  it('keeps unused keys with the first recommended model, default provider first', () => {
    const result = convert({
      ai: {
        apiKeys: [key({ provider: 'openai' }), key({ provider: 'groq' }), key({ provider: 'anthropic' })],
        defaultProvider: 'anthropic',
        featureConfigs: [],
      },
    });

    expect(result.ai.connections.map(({ name, model }) => [name, model])).toEqual([
      ['Claude', 'claude-haiku-4-5'],
      ['OpenAI', 'gpt-5.4-nano'],
      ['Groq', 'openai/gpt-oss-20b'],
    ]);
    expect(result.ai.featureConfigs.every(({ connectionId }) => connectionId === null)).toBe(true);
    expect(result.ai.featureConfigs).toHaveLength(4);
  });

  it('dedupes keys per provider and configs per feature, first entry wins', () => {
    const result = convert({
      ai: {
        apiKeys: [
          key({ provider: 'openai', keyEncrypted: 'first' }),
          key({ provider: 'openai', keyEncrypted: 'second' }),
        ],
        featureConfigs: [
          { feature: 'categorization', modelId: 'openai/gpt-5.6-sol' },
          { feature: 'categorization', modelId: 'openai/gpt-5.4-nano' },
        ],
      },
    });

    expect(result.ai.connections).toEqual([
      expect.objectContaining({ name: 'OpenAI', model: 'gpt-5.6-sol', keyEncrypted: 'first' }),
    ]);
  });

  it('makes names unique case-insensitively and truncates them within 50 chars including the suffix', () => {
    const longName = 'x'.repeat(50);
    const result = convert({
      ai: {
        apiKeys: [key({ provider: 'anthropic' })],
        customEndpoints: [endpoint({ id: 'claude', name: 'claude' }), endpoint({ id: 'long', name: longName })],
        featureConfigs: [
          customConfig({ feature: 'statement_parsing', endpointId: 'long', model: 'model-a' }),
          customConfig({ feature: 'investment_transactions_parsing', endpointId: 'long', model: 'model-b' }),
        ],
      },
    });

    expect(result.ai.connections.map(({ name }) => name)).toEqual([
      'claude',
      longName,
      `${'x'.repeat(48)} 2`,
      `${'x'.repeat(48)} 3`,
      'Claude 2',
    ]);
    expect(result.ai.connections.every(({ name }) => name.length <= 50)).toBe(true);
  });

  it('drops legacy keys from an otherwise empty ai block and keeps the rest of the settings', () => {
    const result = convert({ ai: { apiKeys: [], featureConfigs: [], customInstructions: 'Be brief' } });

    expect(result).toEqual({
      locale: 'en',
      ai: { featureConfigs: [], connections: [], customInstructions: 'Be brief' },
    });
  });

  it('clears old-shape configs when the user ends up with no connection', () => {
    const result = convert({
      ai: {
        featureConfigs: [
          { feature: 'categorization', modelId: 'anthropic/claude-opus-5' },
          { feature: 'receipt_parsing', modelId: 'google/gemini-3.5-flash-lite' },
        ],
      },
    });

    expect(result.ai).toEqual({ featureConfigs: [], connections: [] });
  });

  it('is idempotent and returns new-shape or non-AI settings untouched', () => {
    const converted = convert({
      ai: {
        apiKeys: [key({ provider: 'anthropic' })],
        customEndpoints: [endpoint({ id: 'e1' })],
        featureConfigs: [customConfig({ feature: 'categorization', endpointId: 'e1', model: 'qwen3' })],
      },
    });
    expect(unifyAiConnections({ settings: converted })).toBe(converted);

    const newShape = {
      ai: {
        featureConfigs: [{ feature: 'categorization', connectionId: null }],
        connections: [{ id: 'c1', provider: 'openai', name: 'OpenAI', model: 'gpt-5.4-nano' }],
      },
    };
    expect(unifyAiConnections({ settings: newShape })).toBe(newShape);

    const noAi = { locale: 'uk' };
    expect(unifyAiConnections({ settings: noAi })).toBe(noAi);
  });

  it('never throws on unexpected shapes and skips malformed entries', () => {
    expect(unifyAiConnections({ settings: null })).toBeNull();
    expect(unifyAiConnections({ settings: 'oops' })).toBe('oops');
    const aiArray = { ai: [] };
    expect(unifyAiConnections({ settings: aiArray })).toBe(aiArray);

    const result = convert({
      ai: {
        apiKeys: 'oops',
        customEndpoints: [endpoint({ id: 'e1', baseUrl: undefined }), 42, null],
        featureConfigs: [null, { feature: 'unknown_feature', modelId: 'openai/gpt-5.4-nano' }],
      },
    });
    expect(result.ai).toEqual({ featureConfigs: [], connections: [] });

    const partial = convert({
      ai: {
        apiKeys: [{ provider: 'mistral', keyEncrypted: 'x' }, { provider: 'openai' }, key({ provider: 'google' })],
        featureConfigs: [],
      },
    });
    expect(new Set(partial.ai.connections.map(({ provider }) => provider))).toEqual(new Set(['google']));
  });

  it('produces settings the live settings schema accepts', async () => {
    const { ZodSettingsSchema } = await import('@models/user-settings.model');
    const result = convert({
      ai: {
        apiKeys: [
          key({ provider: 'groq' }),
          key({ provider: 'anthropic', status: 'invalid', invalidatedAt: INVALIDATED }),
        ],
        customEndpoints: [endpoint({ id: 'e1', name: 'y'.repeat(50) }), endpoint({ id: 'e2', status: 'invalid' })],
        featureConfigs: [
          customConfig({ feature: 'categorization', endpointId: 'e1', model: 'z'.repeat(200) }),
          { feature: 'statement_parsing', modelId: 'anthropic/claude-sonnet-4-5' },
          { feature: 'receipt_parsing', modelId: 'google/gemini-3.5-flash-lite' },
        ],
        customInstructions: 'Be brief',
      },
    });

    const parsed = ZodSettingsSchema.safeParse(result);
    expect(parsed.error?.issues).toBeUndefined();
    expect(parsed.data?.ai).toEqual(result.ai);
  });

  it('stays within 13 connections for the largest legacy shape', () => {
    const endpoints = ['e1', 'e2', 'e3', 'e4', 'e5'].map((id) => endpoint({ id }));
    const features: Feature[] = [
      'categorization',
      'statement_parsing',
      'investment_transactions_parsing',
      'receipt_parsing',
    ];
    const result = convert({
      ai: {
        apiKeys: ['openai', 'anthropic', 'google', 'groq'].map((provider) => key({ provider })),
        customEndpoints: endpoints,
        featureConfigs: features.map((feature, index) =>
          customConfig({ feature, endpointId: `e${index + 1}`, model: `override-${index}` }),
        ),
      },
    });

    expect(result.ai.connections).toHaveLength(13);
    expect(new Set(result.ai.connections.map(({ id }) => id)).size).toBe(13);
    expect(new Set(result.ai.connections.map(({ name }) => name.toLowerCase())).size).toBe(13);
  });
});
