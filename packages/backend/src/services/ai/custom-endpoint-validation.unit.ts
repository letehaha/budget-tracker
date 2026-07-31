// The verdict this file produces is what a user is told about their own endpoint,
// so a misfire either hides a real problem or blames the wrong thing.

import { i18nextReady, t } from '@i18n/index';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { ValidationError } from '@js/errors';

import { pickListedModelsToShow, readModelIds, validateCustomEndpoint } from './custom-endpoint-validation';

describe('readModelIds', () => {
  it('reads the ids out of an OpenAI-style list', () => {
    const body = { object: 'list', data: [{ id: 'llama3.2' }, { id: 'qwen2.5' }] };
    expect(readModelIds({ body })).toEqual(['llama3.2', 'qwen2.5']);
  });

  it('keeps only the entries that carry a usable id', () => {
    const body = { data: [{ id: 'llama3.2' }, { id: '' }, { id: 42 }, null, 'qwen2.5'] };
    expect(readModelIds({ body })).toEqual(['llama3.2']);
  });

  it.each([
    ['a body that is not an object', 'llama3.2'],
    ['a body without data', { object: 'list' }],
    ['a body whose data is not an array', { data: { id: 'llama3.2' } }],
    ['null', null],
  ])('returns nothing for %s', (_label, body) => {
    expect(readModelIds({ body })).toEqual([]);
  });
});

describe('pickListedModelsToShow', () => {
  it('puts ids sharing a prefix with the typed name first', () => {
    const modelIds = ['mistral', 'qwen3.6-35b-distilled@q6_k', 'phi4'];

    const { shown } = pickListedModelsToShow({ modelName: 'qwen3.6-35b-distill', modelIds });

    expect(shown[0]).toBe('qwen3.6-35b-distilled@q6_k');
  });

  // An aggregator lists hundreds of ids; the message has to stay readable
  it('caps the ids it shows and counts the rest', () => {
    const modelIds = Array.from({ length: 40 }, (_, index) => `model-${index}`);

    const { shown, remaining } = pickListedModelsToShow({ modelName: 'nothing-alike', modelIds });

    expect(shown).toHaveLength(5);
    expect(remaining).toBe(35);
  });

  it('reports nothing remaining when every id fits', () => {
    const { shown, remaining } = pickListedModelsToShow({ modelName: 'llama3.2', modelIds: ['llama3.2', 'qwen2.5'] });

    expect(shown).toEqual(['llama3.2', 'qwen2.5']);
    expect(remaining).toBe(0);
  });
});

describe('validateCustomEndpoint', () => {
  const BASE_URL = 'http://listing-llm.test/v1';
  const MODEL = 'llama3.2';

  let selfHostFlagBeforeTest: string | undefined;
  let fetchBeforeTest: typeof globalThis.fetch;
  let generateCalls: number;

  beforeAll(async () => {
    // The verdicts are translated strings, so the locale has to be loaded to compare them
    await i18nextReady;
  });

  beforeEach(() => {
    selfHostFlagBeforeTest = process.env.IS_SELF_HOST;
    // Self-host mode stands the outbound guard down, so `createGuardedFetch` hands
    // back the stub below instead of resolving a hostname that does not exist.
    process.env.IS_SELF_HOST = 'true';
    fetchBeforeTest = globalThis.fetch;
    generateCalls = 0;
  });

  afterEach(() => {
    globalThis.fetch = fetchBeforeTest;

    if (selfHostFlagBeforeTest === undefined) {
      delete process.env.IS_SELF_HOST;
    } else {
      process.env.IS_SELF_HOST = selfHostFlagBeforeTest;
    }
  });

  function jsonResponse({ body, status = 200 }: { body: unknown; status?: number }): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }

  /** Chat-completion payload shaped the way `@ai-sdk/openai`'s chat model parses it. */
  function completionResponse(): Response {
    return jsonResponse({
      body: {
        id: 'chatcmpl-unit',
        object: 'chat.completion',
        created: 1_700_000_000,
        model: MODEL,
        choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 12, completion_tokens: 1, total_tokens: 13 },
      },
    });
  }

  /**
   * Answers `/models` with `onModelList` and counts every `/chat/completions` post,
   * so a test can prove whether the generate probe ran at all.
   */
  function stubEndpoint({
    onModelList,
    onGenerate = () => completionResponse(),
  }: {
    onModelList: () => Response;
    onGenerate?: () => Response;
  }): void {
    globalThis.fetch = (async (input: Parameters<typeof globalThis.fetch>[0]) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.endsWith('/models')) return onModelList();

      if (url.endsWith('/chat/completions')) {
        generateCalls += 1;
        return onGenerate();
      }

      throw new Error(`Unexpected request to ${url}`);
    }) as typeof globalThis.fetch;
  }

  function listOf({ modelIds }: { modelIds: string[] }): Response {
    return jsonResponse({ body: { object: 'list', data: modelIds.map((id) => ({ id, object: 'model' })) } });
  }

  it('accepts a model the endpoint lists without asking it to generate', async () => {
    stubEndpoint({ onModelList: () => listOf({ modelIds: ['qwen2.5', MODEL] }) });

    const result = await validateCustomEndpoint({ baseUrl: BASE_URL, modelName: MODEL, apiKey: null });

    expect(result.isValid).toBe(true);
    expect(generateCalls).toBe(0);
  });

  // The server may answer a generate call with whatever model it has loaded, so the
  // list is the only thing that can tell a typo apart from a served model.
  it('rejects a model the endpoint does not list and names what it offers', async () => {
    stubEndpoint({ onModelList: () => listOf({ modelIds: ['qwen2.5', 'mistral'] }) });

    const result = await validateCustomEndpoint({ baseUrl: BASE_URL, modelName: 'llama3.2-typo', apiKey: null });

    expect(result.isValid).toBe(false);
    expect(result.error).toContain('llama3.2-typo');
    expect(result.error).toContain('qwen2.5');
    expect(result.error).toContain('mistral');
    expect(generateCalls).toBe(0);
  });

  it('shows the closest ids first and counts the ones it leaves out', async () => {
    const modelIds = ['unrelated-a', 'unrelated-b', 'unrelated-c', 'unrelated-d', `${MODEL}-distilled@q6_k`];
    stubEndpoint({ onModelList: () => listOf({ modelIds }) });

    const result = await validateCustomEndpoint({ baseUrl: BASE_URL, modelName: `${MODEL}-distill`, apiKey: null });

    expect(result.error).toContain(`${MODEL}-distilled@q6_k`);
  });

  it('reports an auth failure when the list request is refused', async () => {
    stubEndpoint({ onModelList: () => jsonResponse({ body: { error: 'no' }, status: 401 }) });

    const result = await validateCustomEndpoint({ baseUrl: BASE_URL, modelName: MODEL, apiKey: 'wrong-key' });

    expect(result.isValid).toBe(false);
    expect(result.error).toBe(t({ key: 'ai.customEndpointAuthFailed' }));
    expect(generateCalls).toBe(0);
  });

  it('reports the endpoint unreachable when the list request never connects', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof globalThis.fetch;

    const result = await validateCustomEndpoint({ baseUrl: BASE_URL, modelName: MODEL, apiKey: null });

    expect(result.isValid).toBe(false);
    expect(result.error).toBe(t({ key: 'ai.customEndpointUnreachable' }));
  });

  it('rethrows a blocked-address rejection instead of turning it into a verdict', async () => {
    globalThis.fetch = (async () => {
      throw new ValidationError({ message: 'blocked' });
    }) as typeof globalThis.fetch;

    await expect(validateCustomEndpoint({ baseUrl: BASE_URL, modelName: MODEL, apiKey: null })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('falls back to the generate probe when the endpoint has no list route', async () => {
    stubEndpoint({ onModelList: () => jsonResponse({ body: { error: 'not found' }, status: 404 }) });

    const result = await validateCustomEndpoint({ baseUrl: BASE_URL, modelName: MODEL, apiKey: null });

    expect(result.isValid).toBe(true);
    expect(generateCalls).toBe(1);
  });

  it('falls back to the generate probe when the list body is not JSON', async () => {
    stubEndpoint({ onModelList: () => new Response('<html>nope</html>', { status: 200 }) });

    const result = await validateCustomEndpoint({ baseUrl: BASE_URL, modelName: MODEL, apiKey: null });

    expect(result.isValid).toBe(true);
    expect(generateCalls).toBe(1);
  });

  it.each([
    ['an empty list', { object: 'list', data: [] }],
    ['a shape it cannot read', { models: ['llama3.2'] }],
  ])('falls back to the generate probe for %s', async (_label, body) => {
    stubEndpoint({ onModelList: () => jsonResponse({ body }) });

    const result = await validateCustomEndpoint({ baseUrl: BASE_URL, modelName: MODEL, apiKey: null });

    expect(result.isValid).toBe(true);
    expect(generateCalls).toBe(1);
  });

  // A busy aggregator or an Ollama loading a model can be slow to list and still
  // serve a completion, so the list deadline must not decide the endpoint is dead.
  it('falls back to the generate probe when the list request times out', async () => {
    stubEndpoint({
      onModelList: () => {
        throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
      },
    });

    const result = await validateCustomEndpoint({ baseUrl: BASE_URL, modelName: MODEL, apiKey: null });

    expect(result.isValid).toBe(true);
    expect(generateCalls).toBe(1);
  });

  // Reachable and authenticated, just busy: rejecting here would make a working
  // endpoint unsaveable, so the verdict is left to real usage.
  it('accepts the endpoint when the generate probe hits a rate limit', async () => {
    stubEndpoint({
      onModelList: () => jsonResponse({ body: { error: 'not found' }, status: 404 }),
      onGenerate: () =>
        jsonResponse({ body: { error: { message: 'rate limit reached', type: 'rate_limit_exceeded' } }, status: 429 }),
    });

    const result = await validateCustomEndpoint({ baseUrl: BASE_URL, modelName: MODEL, apiKey: null });

    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('reports a model the generate probe rejects when there is no list to check', async () => {
    stubEndpoint({
      onModelList: () => jsonResponse({ body: { error: 'not found' }, status: 404 }),
      onGenerate: () =>
        jsonResponse({ body: { error: { message: 'model not found', code: 'model_not_found' } }, status: 404 }),
    });

    const result = await validateCustomEndpoint({ baseUrl: BASE_URL, modelName: MODEL, apiKey: null });

    expect(result.isValid).toBe(false);
    expect(result.error).toBe(t({ key: 'ai.customEndpointModelNotFound', variables: { model: MODEL } }));
    expect(generateCalls).toBe(1);
  });

  it('sends the API key with the list request only when there is one', async () => {
    const authorizationHeaders: (string | null)[] = [];
    globalThis.fetch = (async (input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
      authorizationHeaders.push(new Headers(init?.headers).get('authorization'));
      return listOf({ modelIds: [MODEL] });
    }) as typeof globalThis.fetch;

    await validateCustomEndpoint({ baseUrl: BASE_URL, modelName: MODEL, apiKey: 'endpoint-key' });
    await validateCustomEndpoint({ baseUrl: BASE_URL, modelName: MODEL, apiKey: null });

    expect(authorizationHeaders).toEqual(['Bearer endpoint-key', null]);
  });
});
