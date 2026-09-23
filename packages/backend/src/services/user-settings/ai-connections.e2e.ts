import {
  AI_CONNECTION_NAME_MAX_LENGTH,
  AI_FEATURE,
  AI_MODEL_NAME_MAX_LENGTH,
  AI_PROVIDER,
  API_ERROR_CODES,
  CreateAIConnectionBody,
  MAX_AI_CONNECTIONS,
  TestAIConnectionBody,
  UpdateAIConnectionBody,
} from '@bt/shared/types';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { RateLimitService } from '@services/common/rate-limit.service';
import * as helpers from '@tests/helpers';
import { enableServerModel, runAsCloud, useSelfHostWithoutServerAiKeys } from '@tests/helpers/ai-test-env';
import {
  FIRST_CONNECTION_NAME,
  SECOND_CONNECTION_MODEL,
  SECOND_CONNECTION_NAME,
  createFirstConnection,
  createOpenAiConnection,
  createSecondConnection,
  errorMessage,
  getTestUserId,
  patchStoredConnection,
  readStoredConnections,
  readStoredFeatureConfigs,
} from '@tests/helpers/user-settings';
import {
  ANTHROPIC_API_URL,
  ANTHROPIC_LISTED_MODELS,
  INVALID_ANTHROPIC_API_KEY,
  VALID_ANTHROPIC_API_KEY,
} from '@tests/mocks/anthropic/mock-api';
import {
  GEMINI_LISTED_MODELS,
  INVALID_GEMINI_API_KEY,
  VALID_GEMINI_API_KEY,
  createGeminiMock,
} from '@tests/mocks/gemini/mock-api';
import { createCallsCounter } from '@tests/mocks/helpers';
import {
  CUSTOM_ENDPOINT_BASE_URL,
  CUSTOM_ENDPOINT_LISTED_MODELS,
  CUSTOM_ENDPOINT_LISTING_BASE_URL,
  CUSTOM_ENDPOINT_LOOPBACK_BASE_URL,
  CUSTOM_ENDPOINT_MODEL,
  CUSTOM_ENDPOINT_OFFLINE_BASE_URL,
  CUSTOM_ENDPOINT_UNKNOWN_MODEL,
  INVALID_CUSTOM_ENDPOINT_API_KEY,
  VALID_CUSTOM_ENDPOINT_API_KEY,
  getCustomEndpointAuthErrorMock,
  getCustomEndpointModelListAuthErrorMock,
  getCustomEndpointModelListMock,
  getCustomEndpointModelNotFoundMock,
  getCustomEndpointOfflineMock,
  getCustomEndpointRequireKeyMock,
  getCustomEndpointSuccessMock,
  getCustomEndpointWebPageMocks,
} from '@tests/mocks/openai-compatible/mock-api';
import {
  INVALID_OPENAI_API_KEY,
  OPENAI_LISTED_MODELS,
  OPENAI_RESPONSES_URL,
  OPENAI_UNKNOWN_MODEL,
  VALID_OPENAI_API_KEY,
} from '@tests/mocks/openai/mock-api';
import { randomUUID } from 'node:crypto';

const OPENAI_MODEL = OPENAI_LISTED_MODELS[0]!;
const ANTHROPIC_MODEL = ANTHROPIC_LISTED_MODELS[0]!;
const GOOGLE_MODEL = GEMINI_LISTED_MODELS[1]!;

const PROBE_BUDGET_PER_MINUTE = 15;

const NATIVE_CASES = [
  {
    provider: AI_PROVIDER.openai,
    model: OPENAI_MODEL,
    validKey: VALID_OPENAI_API_KEY,
    invalidKey: INVALID_OPENAI_API_KEY,
  },
  {
    provider: AI_PROVIDER.anthropic,
    model: ANTHROPIC_MODEL,
    validKey: VALID_ANTHROPIC_API_KEY,
    invalidKey: INVALID_ANTHROPIC_API_KEY,
  },
  {
    provider: AI_PROVIDER.google,
    model: GOOGLE_MODEL,
    validKey: VALID_GEMINI_API_KEY,
    invalidKey: INVALID_GEMINI_API_KEY,
  },
];

function countCalls({ url }: { url: string }) {
  return createCallsCounter(global.mswMockServer, url);
}

function countChatCalls({ baseUrl = CUSTOM_ENDPOINT_BASE_URL }: { baseUrl?: string } = {}) {
  return countCalls({ url: `${baseUrl}/chat/completions` });
}

/** The listing server proves the model from its catalogue, so a create costs no generate call. */
function createListedConnection({ name }: { name: string }) {
  return helpers.createAiConnection({
    provider: AI_PROVIDER.custom,
    name,
    baseUrl: CUSTOM_ENDPOINT_LISTING_BASE_URL,
    model: CUSTOM_ENDPOINT_MODEL,
  });
}

describe('AI connections', () => {
  useSelfHostWithoutServerAiKeys();

  describe('Authentication', () => {
    it('refuses every connection route without a session', async () => {
      const id = randomUUID();

      const responses = await helpers.withoutSession(() =>
        Promise.all([
          helpers.getAiConnections(),
          helpers.createAiConnection({
            provider: AI_PROVIDER.custom,
            name: FIRST_CONNECTION_NAME,
            baseUrl: CUSTOM_ENDPOINT_BASE_URL,
            model: CUSTOM_ENDPOINT_MODEL,
          }),
          helpers.updateAiConnection({ id, name: 'Renamed' }),
          helpers.deleteAiConnection({ id }),
          helpers.setDefaultAiConnection({ id }),
          helpers.testAiConnection({ connectionId: id }),
        ]),
      );

      expect(responses.map((response) => response.statusCode)).toEqual(responses.map(() => 401));
    });
  });

  describe('GET /user/settings/ai/connections', () => {
    it('returns an empty array when nothing is configured', async () => {
      expect(await helpers.getAiConnections({ raw: true })).toEqual([]);
    });

    it('lists connections in list order without key material', async () => {
      const apiKey = 'super-secret-connection-key';
      const first = await createFirstConnection({ apiKey });
      const second = await createSecondConnection({ apiKey: `${apiKey}-two` });
      const native = await createOpenAiConnection();

      const connections = await helpers.getAiConnections({ raw: true });

      expect(connections.map(({ id }) => id)).toEqual([first.id, second.id, native.id]);
      expect(connections.map(({ name }) => name)).toEqual([FIRST_CONNECTION_NAME, SECOND_CONNECTION_NAME, 'GPT fast']);
      expect(connections.map(({ provider }) => provider)).toEqual([
        AI_PROVIDER.custom,
        AI_PROVIDER.custom,
        AI_PROVIDER.openai,
      ]);
      expect(connections[1]!.baseUrl).toBe(CUSTOM_ENDPOINT_LOOPBACK_BASE_URL);
      expect(connections[1]!.model).toBe(SECOND_CONNECTION_MODEL);
      expect(connections[2]!.baseUrl).toBeUndefined();
      expect(connections.every(({ hasApiKey }) => hasApiKey)).toBe(true);

      const serialized = JSON.stringify(connections);
      expect(serialized).not.toContain(apiKey);
      expect(serialized).not.toContain(VALID_OPENAI_API_KEY);
      expect(serialized).not.toContain('keyEncrypted');
      expect(serialized).not.toContain('"apiKey"');
    });
  });

  describe('POST /user/settings/ai/connections – custom', () => {
    it('creates a connection that answers and returns its info', async () => {
      const response = await helpers.createAiConnection({
        provider: AI_PROVIDER.custom,
        name: FIRST_CONNECTION_NAME,
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        model: CUSTOM_ENDPOINT_MODEL,
      });

      expect(response.statusCode).toBe(201);

      const created = response.body.response;
      expect(created).toMatchObject({
        id: expect.any(String),
        provider: AI_PROVIDER.custom,
        name: FIRST_CONNECTION_NAME,
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        model: CUSTOM_ENDPOINT_MODEL,
        hasApiKey: false,
        status: 'valid',
        lastValidatedAt: expect.any(String),
        createdAt: expect.any(String),
      });
      expect(created.lastError).toBeUndefined();
      expect(created.invalidatedAt).toBeUndefined();
    });

    it('trims the name and model and strips trailing slashes from the base URL', async () => {
      const created = await helpers.createAiConnection({
        provider: AI_PROVIDER.custom,
        name: `  ${FIRST_CONNECTION_NAME}  `,
        baseUrl: `${CUSTOM_ENDPOINT_BASE_URL}//`,
        model: `  ${CUSTOM_ENDPOINT_MODEL}  `,
        raw: true,
      });

      expect(created.name).toBe(FIRST_CONNECTION_NAME);
      expect(created.baseUrl).toBe(CUSTOM_ENDPOINT_BASE_URL);
      expect(created.model).toBe(CUSTOM_ENDPOINT_MODEL);
    });

    it('stores the API key encrypted', async () => {
      const userId = await getTestUserId();
      const apiKey = 'super-secret-connection-key';

      const created = await createFirstConnection({ apiKey });
      expect(created.hasApiKey).toBe(true);

      const [stored] = await readStoredConnections({ userId });
      expect(stored?.keyEncrypted).toEqual(expect.any(String));
      expect(stored?.keyEncrypted).not.toContain(apiKey);
    });

    it('rejects malformed create payloads and persists nothing', async () => {
      const valid = {
        provider: AI_PROVIDER.custom,
        name: FIRST_CONNECTION_NAME,
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        model: CUSTOM_ENDPOINT_MODEL,
      };
      const { model: _model, ...withoutModel } = valid;
      const { baseUrl: _baseUrl, ...withoutBaseUrl } = valid;

      const invalidPayloads: Record<string, unknown>[] = [
        withoutModel,
        withoutBaseUrl,
        { ...valid, provider: 'groq' },
        { ...valid, name: '   ' },
        { ...valid, name: 'n'.repeat(AI_CONNECTION_NAME_MAX_LENGTH + 1) },
        { ...valid, model: '   ' },
        { ...valid, model: 'm'.repeat(AI_MODEL_NAME_MAX_LENGTH + 1) },
        { ...valid, baseUrl: 'not-a-url' },
        { ...valid, baseUrl: `${CUSTOM_ENDPOINT_BASE_URL}/${'p'.repeat(500)}` },
        { ...valid, keyFromConnectionId: 'not-a-uuid' },
      ];

      for (const payload of invalidPayloads) {
        const response = await helpers.createAiConnection(payload as unknown as CreateAIConnectionBody);
        expect({ payload, statusCode: response.statusCode }).toStrictEqual({
          payload,
          statusCode: 422,
        });
      }

      expect(await helpers.getAiConnections({ raw: true })).toEqual([]);
    });

    it('rejects a name already taken, regardless of case or provider, and persists nothing new', async () => {
      await createFirstConnection();

      const sameCustomName = await helpers.createAiConnection({
        provider: AI_PROVIDER.custom,
        name: FIRST_CONNECTION_NAME.toUpperCase(),
        baseUrl: CUSTOM_ENDPOINT_LOOPBACK_BASE_URL,
        model: SECOND_CONNECTION_MODEL,
      });
      const sameNativeName = await helpers.createAiConnection({
        provider: AI_PROVIDER.openai,
        name: FIRST_CONNECTION_NAME.toLowerCase(),
        model: OPENAI_MODEL,
        apiKey: VALID_OPENAI_API_KEY,
      });

      expect(sameCustomName.statusCode).toBe(422);
      expect(sameNativeName.statusCode).toBe(422);
      expect(await helpers.getAiConnections({ raw: true })).toHaveLength(1);
    });

    it('rejects a server that answers 401 and persists nothing', async () => {
      const response = await helpers.createAiConnection({
        provider: AI_PROVIDER.custom,
        name: FIRST_CONNECTION_NAME,
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        model: CUSTOM_ENDPOINT_MODEL,
        apiKey: INVALID_CUSTOM_ENDPOINT_API_KEY,
      });

      expect(response.statusCode).toBe(422);
      expect(await helpers.getAiConnections({ raw: true })).toEqual([]);
    });

    it('rejects a model the server does not serve and leaves saved connections untouched', async () => {
      const first = await createFirstConnection();

      const response = await helpers.createAiConnection({
        provider: AI_PROVIDER.custom,
        name: SECOND_CONNECTION_NAME,
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        model: CUSTOM_ENDPOINT_UNKNOWN_MODEL,
      });

      expect(response.statusCode).toBe(422);
      expect(await helpers.getAiConnections({ raw: true })).toEqual([first]);
    });

    it('tells an unreachable server apart from one that rejects the key', async () => {
      const unreachable = await helpers.createAiConnection({
        provider: AI_PROVIDER.custom,
        name: FIRST_CONNECTION_NAME,
        baseUrl: CUSTOM_ENDPOINT_OFFLINE_BASE_URL,
        model: CUSTOM_ENDPOINT_MODEL,
      });
      const keyRejected = await helpers.createAiConnection({
        provider: AI_PROVIDER.custom,
        name: SECOND_CONNECTION_NAME,
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        model: CUSTOM_ENDPOINT_MODEL,
        apiKey: INVALID_CUSTOM_ENDPOINT_API_KEY,
      });

      expect(unreachable.statusCode).toBe(422);
      expect(keyRejected.statusCode).toBe(422);
      expect(errorMessage({ response: unreachable })).toEqual(expect.any(String));
      expect(errorMessage({ response: unreachable })).not.toBe(errorMessage({ response: keyRejected }));
      expect(await helpers.getAiConnections({ raw: true })).toEqual([]);
    }, 30_000);

    it(`refuses a connection beyond the per-user cap of ${MAX_AI_CONNECTIONS} and keeps the stored ones`, async () => {
      const userId = await getTestUserId();

      for (let index = 1; index <= MAX_AI_CONNECTIONS; index++) {
        // The cap sits above the per-minute probe budget, which this test is not measuring.
        await RateLimitService.resetRateLimit(`ai-connection-probe:user:${userId}`);
        expect((await createListedConnection({ name: `Model ${index}` })).statusCode).toBe(201);
      }

      const overCap = await createListedConnection({ name: 'One too many' });

      expect(overCap.statusCode).toBe(422);
      expect(await helpers.getAiConnections({ raw: true })).toHaveLength(MAX_AI_CONNECTIONS);
    }, 30_000);

    it('saves a model the server lists without asking it to generate', async () => {
      const probes = countChatCalls({
        baseUrl: CUSTOM_ENDPOINT_LISTING_BASE_URL,
      });

      const created = await helpers.createAiConnection({
        provider: AI_PROVIDER.custom,
        name: FIRST_CONNECTION_NAME,
        baseUrl: CUSTOM_ENDPOINT_LISTING_BASE_URL,
        model: CUSTOM_ENDPOINT_MODEL,
        raw: true,
      });

      expect(created.status).toBe('valid');
      expect(probes.count).toBe(0);
    });

    it('rejects a model missing from the server model list and says what it offers', async () => {
      const response = await helpers.createAiConnection({
        provider: AI_PROVIDER.custom,
        name: FIRST_CONNECTION_NAME,
        baseUrl: CUSTOM_ENDPOINT_LISTING_BASE_URL,
        model: CUSTOM_ENDPOINT_UNKNOWN_MODEL,
      });

      expect(response.statusCode).toBe(422);
      expect(errorMessage({ response })).toContain(CUSTOM_ENDPOINT_UNKNOWN_MODEL);
      expect(errorMessage({ response })).toContain(CUSTOM_ENDPOINT_LISTED_MODELS[0]);
      expect(await helpers.getAiConnections({ raw: true })).toEqual([]);
    });

    it('rejects a model missing from a list served at a base URL that also answers generate calls', async () => {
      global.mswMockServer.use(
        getCustomEndpointModelListMock({
          baseUrl: CUSTOM_ENDPOINT_BASE_URL,
          modelIds: ['phi4'],
        }),
      );

      const response = await helpers.createAiConnection({
        provider: AI_PROVIDER.custom,
        name: FIRST_CONNECTION_NAME,
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        model: CUSTOM_ENDPOINT_MODEL,
      });

      expect(response.statusCode).toBe(422);
      expect(errorMessage({ response })).toContain('phi4');
      expect(await helpers.getAiConnections({ raw: true })).toEqual([]);
    });

    it('rejects a server whose model list refuses the key, without a generate call', async () => {
      global.mswMockServer.use(
        getCustomEndpointModelListAuthErrorMock({
          baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        }),
      );
      const probes = countChatCalls();

      const response = await helpers.createAiConnection({
        provider: AI_PROVIDER.custom,
        name: FIRST_CONNECTION_NAME,
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        model: CUSTOM_ENDPOINT_MODEL,
      });

      expect(response.statusCode).toBe(422);
      expect(errorMessage({ response })).not.toContain(CUSTOM_ENDPOINT_MODEL);
      expect(probes.count).toBe(0);
      expect(await helpers.getAiConnections({ raw: true })).toEqual([]);
    });

    it('allows a loopback server on a self-hosted instance', async () => {
      global.mswMockServer.use(
        getCustomEndpointSuccessMock({
          baseUrl: CUSTOM_ENDPOINT_LOOPBACK_BASE_URL,
        }),
      );

      const created = await helpers.createAiConnection({
        provider: AI_PROVIDER.custom,
        name: SECOND_CONNECTION_NAME,
        baseUrl: CUSTOM_ENDPOINT_LOOPBACK_BASE_URL,
        model: CUSTOM_ENDPOINT_MODEL,
        raw: true,
      });

      expect(created.baseUrl).toBe(CUSTOM_ENDPOINT_LOOPBACK_BASE_URL);
      expect(created.status).toBe('valid');
    });
  });

  describe('POST /user/settings/ai/connections – native providers', () => {
    beforeEach(() => {
      global.mswMockServer.use(createGeminiMock({ expectedModel: GOOGLE_MODEL }));
    });

    it.each(NATIVE_CASES)(
      'creates a $provider connection at the official API',
      async ({ provider, model, validKey }) => {
        const userId = await getTestUserId();

        const response = await helpers.createAiConnection({
          provider,
          name: `My ${provider}`,
          model,
          apiKey: validKey,
        });

        expect(response.statusCode).toBe(201);
        expect(response.body.response).toMatchObject({
          provider,
          name: `My ${provider}`,
          model,
          hasApiKey: true,
          status: 'valid',
        });
        expect(response.body.response.baseUrl).toBeUndefined();

        const [stored] = await readStoredConnections({ userId });
        expect(stored?.baseUrl).toBeUndefined();
        expect(stored?.keyEncrypted).not.toContain(validKey);
      },
    );

    it.each(NATIVE_CASES)(
      'rejects a key $provider refuses and persists nothing',
      async ({ provider, model, invalidKey }) => {
        const response = await helpers.createAiConnection({
          provider,
          name: `My ${provider}`,
          model,
          apiKey: invalidKey,
        });

        expect(response.statusCode).toBe(422);
        expect(errorMessage({ response })).toEqual(expect.any(String));
        expect(await helpers.getAiConnections({ raw: true })).toEqual([]);
      },
    );

    it('refuses a base URL for a native provider', async () => {
      const response = await helpers.createAiConnection({
        provider: AI_PROVIDER.openai,
        name: 'GPT fast',
        model: OPENAI_MODEL,
        apiKey: VALID_OPENAI_API_KEY,
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
      });

      expect(response.statusCode).toBe(422);
      expect(await helpers.getAiConnections({ raw: true })).toEqual([]);
    });
  });

  describe('POST /user/settings/ai/connections – keyFromConnectionId', () => {
    it('reuses the stored key of a connection of the same provider', async () => {
      const userId = await getTestUserId();
      const source = await createOpenAiConnection({
        name: 'GPT smart',
        model: OPENAI_LISTED_MODELS[2],
      });

      const duplicate = await helpers.createAiConnection({
        provider: AI_PROVIDER.openai,
        name: 'GPT fast',
        model: OPENAI_MODEL,
        keyFromConnectionId: source.id,
        raw: true,
      });

      expect(duplicate.hasApiKey).toBe(true);
      expect(duplicate.status).toBe('valid');

      const [storedSource, storedDuplicate] = await readStoredConnections({
        userId,
      });
      expect(storedDuplicate?.id).toBe(duplicate.id);
      expect(storedDuplicate?.keyEncrypted).toBe(storedSource?.keyEncrypted);
    });

    it('sends a typed key instead of the source key', async () => {
      const source = await createOpenAiConnection({ name: 'GPT smart' });

      const response = await helpers.createAiConnection({
        provider: AI_PROVIDER.openai,
        name: 'GPT fast',
        model: OPENAI_MODEL,
        apiKey: INVALID_OPENAI_API_KEY,
        keyFromConnectionId: source.id,
      });

      expect(response.statusCode).toBe(422);
      expect(await helpers.getAiConnections({ raw: true })).toEqual([source]);
    });

    it('refuses a source of another provider and never sends its key there', async () => {
      const source = await createOpenAiConnection();
      const anthropicCalls = countCalls({ url: ANTHROPIC_API_URL });

      const response = await helpers.createAiConnection({
        provider: AI_PROVIDER.anthropic,
        name: 'Claude fast',
        model: ANTHROPIC_MODEL,
        keyFromConnectionId: source.id,
      });

      expect(response.statusCode).toBe(422);
      expect(anthropicCalls.count).toBe(0);
      expect(await helpers.getAiConnections({ raw: true })).toEqual([source]);
    });

    it('refuses a source that has no key', async () => {
      const source = await createFirstConnection();

      const response = await helpers.createAiConnection({
        provider: AI_PROVIDER.custom,
        name: SECOND_CONNECTION_NAME,
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        model: CUSTOM_ENDPOINT_MODEL,
        keyFromConnectionId: source.id,
      });

      expect(response.statusCode).toBe(422);
      expect(await helpers.getAiConnections({ raw: true })).toEqual([source]);
    });

    it('refuses a source id that addresses no saved connection', async () => {
      const response = await helpers.createAiConnection({
        provider: AI_PROVIDER.openai,
        name: 'GPT fast',
        model: OPENAI_MODEL,
        keyFromConnectionId: randomUUID(),
      });

      expect(response.statusCode).toBe(404);
      expect(await helpers.getAiConnections({ raw: true })).toEqual([]);
    });
  });

  describe('POST /user/settings/ai/connections – outbound URL guard (cloud)', () => {
    const blockedUrls = [
      ['loopback IP', 'http://127.0.0.1:11434/v1'],
      ['hostname resolving to loopback', 'http://localhost:11434/v1'],
      ['cloud metadata service', 'http://169.254.169.254/latest'],
      ['private 10/8 address', 'http://10.0.0.5/v1'],
      ['private 192.168/16 address', 'http://192.168.1.10/v1'],
      ['URL with embedded credentials', 'https://user:pass@example.com/v1'],
      ['non-http protocol', 'ftp://example.com'],
    ];

    it.each(blockedUrls)('rejects a %s and persists nothing', async (_label, baseUrl) => {
      runAsCloud();

      const response = await helpers.createAiConnection({
        provider: AI_PROVIDER.custom,
        name: FIRST_CONNECTION_NAME,
        baseUrl: baseUrl!,
        model: CUSTOM_ENDPOINT_MODEL,
      });

      expect(response.statusCode).toBe(422);
      expect(await helpers.getAiConnections({ raw: true })).toEqual([]);
    });
  });

  describe('PUT /user/settings/ai/connections/:id', () => {
    it('renames without an outbound call and keeps the validation state', async () => {
      const created = await createFirstConnection();
      const probes = countChatCalls();

      const renamed = await helpers.updateAiConnection({
        id: created.id,
        name: 'Renamed Ollama',
        raw: true,
      });

      expect(probes.count).toBe(0);
      expect(renamed).toEqual({ ...created, name: 'Renamed Ollama' });
    });

    it('re-runs the live check when the model changes', async () => {
      const created = await createFirstConnection();
      const probes = countChatCalls();

      const updated = await helpers.updateAiConnection({
        id: created.id,
        model: 'model-after-update',
        raw: true,
      });

      expect(probes.count).toBe(1);
      expect(updated.model).toBe('model-after-update');
      expect(updated.status).toBe('valid');
    });

    it('re-runs the live check and stores the normalized base URL when it changes', async () => {
      const userId = await getTestUserId();
      const created = await createFirstConnection();
      const probes = countChatCalls({ baseUrl: CUSTOM_ENDPOINT_LOOPBACK_BASE_URL });

      const updated = await helpers.updateAiConnection({
        id: created.id,
        baseUrl: `${CUSTOM_ENDPOINT_LOOPBACK_BASE_URL}/`,
        raw: true,
      });

      expect(probes.count).toBe(1);
      expect(updated).toMatchObject({ baseUrl: CUSTOM_ENDPOINT_LOOPBACK_BASE_URL, status: 'valid' });
      const [stored] = await readStoredConnections({ userId });
      expect(stored?.baseUrl).toBe(CUSTOM_ENDPOINT_LOOPBACK_BASE_URL);
    });

    it('keeps the stored key when apiKey is omitted', async () => {
      const created = await createFirstConnection({
        apiKey: VALID_CUSTOM_ENDPOINT_API_KEY,
      });

      // Only the stored key gets a 200, so a passing update proves it was sent
      global.mswMockServer.use(
        getCustomEndpointRequireKeyMock({
          apiKey: VALID_CUSTOM_ENDPOINT_API_KEY,
        }),
      );

      const updated = await helpers.updateAiConnection({
        id: created.id,
        model: 'model-after-update',
        raw: true,
      });

      expect(updated.hasApiKey).toBe(true);
      expect(updated.model).toBe('model-after-update');
    });

    it('replaces the stored key when apiKey is a string', async () => {
      const created = await createFirstConnection({ apiKey: 'first-key' });

      global.mswMockServer.use(getCustomEndpointRequireKeyMock({ apiKey: 'second-key' }));

      const updated = await helpers.updateAiConnection({
        id: created.id,
        apiKey: 'second-key',
        raw: true,
      });
      expect(updated.hasApiKey).toBe(true);

      // Re-testing with no key in the body proves the replacement is what got stored
      const result = await helpers.testAiConnection({
        connectionId: created.id,
        raw: true,
      });
      expect(result.isValid).toBe(true);
    });

    it('removes the stored key of a custom connection when apiKey is null', async () => {
      const userId = await getTestUserId();
      const created = await createFirstConnection({
        apiKey: 'key-to-be-removed',
      });

      const updated = await helpers.updateAiConnection({
        id: created.id,
        apiKey: null,
        raw: true,
      });

      expect(updated.hasApiKey).toBe(false);
      const [stored] = await readStoredConnections({ userId });
      expect(stored?.keyEncrypted).toBeUndefined();
    });

    it('removes the stored key even when the server then refuses anonymous calls', async () => {
      const userId = await getTestUserId();
      const created = await createFirstConnection({
        apiKey: VALID_CUSTOM_ENDPOINT_API_KEY,
      });

      global.mswMockServer.use(
        getCustomEndpointRequireKeyMock({
          apiKey: VALID_CUSTOM_ENDPOINT_API_KEY,
        }),
      );

      const updated = await helpers.updateAiConnection({
        id: created.id,
        apiKey: null,
        raw: true,
      });

      expect(updated).toMatchObject({
        hasApiKey: false,
        status: 'invalid',
        lastError: expect.any(String),
        invalidatedAt: expect.any(String),
      });

      const [stored] = await readStoredConnections({ userId });
      expect(stored?.keyEncrypted).toBeUndefined();

      const [listed] = await helpers.getAiConnections({ raw: true });
      expect(listed).toMatchObject({ hasApiKey: false, status: 'invalid' });
    });

    it('revalidates a native connection with its stored key when the model changes', async () => {
      const created = await createOpenAiConnection();
      const calls = countCalls({ url: OPENAI_RESPONSES_URL });

      const updated = await helpers.updateAiConnection({
        id: created.id,
        model: OPENAI_LISTED_MODELS[2],
        raw: true,
      });

      expect(calls.count).toBe(1);
      expect(updated).toMatchObject({
        model: OPENAI_LISTED_MODELS[2],
        hasApiKey: true,
        status: 'valid',
      });
    });

    it('refuses to clear the key of a native connection', async () => {
      const userId = await getTestUserId();
      const created = await createOpenAiConnection();
      const [before] = await readStoredConnections({ userId });

      const response = await helpers.updateAiConnection({
        id: created.id,
        apiKey: null,
      });

      expect(response.statusCode).toBe(422);
      const [after] = await readStoredConnections({ userId });
      expect(after?.keyEncrypted).toBe(before?.keyEncrypted);
    });

    it('refuses a base URL on a native connection and dials nothing', async () => {
      const created = await createOpenAiConnection();
      const probes = countChatCalls();

      const response = await helpers.updateAiConnection({
        id: created.id,
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
      });

      expect(response.statusCode).toBe(422);
      expect(probes.count).toBe(0);
      expect(await helpers.getAiConnections({ raw: true })).toEqual([created]);
    });

    it('never changes the provider', async () => {
      const created = await createOpenAiConnection();

      await helpers.updateAiConnection({
        id: created.id,
        provider: AI_PROVIDER.anthropic,
      } as unknown as UpdateAIConnectionBody & { id: string });

      const [listed] = await helpers.getAiConnections({ raw: true });
      expect(listed?.provider).toBe(AI_PROVIDER.openai);
    });

    it('updates only the addressed connection', async () => {
      const first = await createFirstConnection();
      const second = await createSecondConnection();

      await helpers.updateAiConnection({
        id: first.id,
        name: 'Renamed Ollama',
      });

      const connections = await helpers.getAiConnections({ raw: true });
      expect(connections.find(({ id }) => id === second.id)).toEqual(second);
    });

    it('rejects a rename onto another connection name', async () => {
      await createFirstConnection();
      const second = await createSecondConnection();

      const response = await helpers.updateAiConnection({
        id: second.id,
        name: FIRST_CONNECTION_NAME.toUpperCase(),
      });

      expect(response.statusCode).toBe(422);
    });

    it('accepts a rename that only changes the casing of its own name', async () => {
      const created = await createFirstConnection();

      const renamed = await helpers.updateAiConnection({
        id: created.id,
        name: FIRST_CONNECTION_NAME.toUpperCase(),
        raw: true,
      });

      expect(renamed.name).toBe(FIRST_CONNECTION_NAME.toUpperCase());
    });

    it('leaves the connection untouched when revalidation fails', async () => {
      const created = await createFirstConnection();

      const response = await helpers.updateAiConnection({
        id: created.id,
        model: CUSTOM_ENDPOINT_UNKNOWN_MODEL,
      });

      expect(response.statusCode).toBe(422);
      expect(await helpers.getAiConnections({ raw: true })).toEqual([created]);
    });

    it('applies the outbound URL guard to a changed base URL in cloud mode', async () => {
      const created = await createFirstConnection();

      runAsCloud();
      const response = await helpers.updateAiConnection({
        id: created.id,
        baseUrl: 'http://169.254.169.254/latest',
      });

      expect(response.statusCode).toBe(422);
      expect(await helpers.getAiConnections({ raw: true })).toEqual([created]);
    });
  });

  describe('Unreadable stored API key', () => {
    it('refuses every path that would dial with the unreadable key, until it is replaced', async () => {
      const userId = await getTestUserId();
      const created = await createFirstConnection({
        apiKey: VALID_CUSTOM_ENDPOINT_API_KEY,
      });
      await patchStoredConnection({ connectionId: created.id, patch: { keyEncrypted: 'unreadable-ciphertext' } });

      // The moved URL answers, so a probe that did go out would come back valid
      const movedBaseUrl = `${CUSTOM_ENDPOINT_BASE_URL}/alt`;
      global.mswMockServer.use(getCustomEndpointSuccessMock({ baseUrl: movedBaseUrl }));
      const movedProbes = countChatCalls({ baseUrl: movedBaseUrl });

      const updated = await helpers.updateAiConnection({
        id: created.id,
        baseUrl: movedBaseUrl,
      });

      expect(updated.statusCode).toBe(422);
      expect(movedProbes.count).toBe(0);

      const [stored] = await readStoredConnections({ userId });
      expect(stored?.baseUrl).toBe(CUSTOM_ENDPOINT_BASE_URL);
      expect(stored?.keyEncrypted).toBe('unreadable-ciphertext');

      expect((await helpers.testAiConnection({ connectionId: created.id })).statusCode).toBe(422);

      // A rename dials nothing, so the unreadable key does not block it
      expect((await helpers.updateAiConnection({ id: created.id, name: 'Renamed' })).statusCode).toBe(200);

      const duplicate = await helpers.createAiConnection({
        provider: AI_PROVIDER.custom,
        name: SECOND_CONNECTION_NAME,
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        model: CUSTOM_ENDPOINT_MODEL,
        keyFromConnectionId: created.id,
      });
      expect(duplicate.statusCode).toBe(422);

      // Replacing the key clears the unreadable ciphertext every step above depends on, so it stays last.
      global.mswMockServer.use(getCustomEndpointRequireKeyMock({ apiKey: 'freshly-entered-key' }));

      const replaced = await helpers.updateAiConnection({
        id: created.id,
        apiKey: 'freshly-entered-key',
        raw: true,
      });

      expect(replaced.hasApiKey).toBe(true);
      expect(replaced.status).toBe('valid');
    }, 30_000);
  });

  describe('DELETE /user/settings/ai/connections/:id', () => {
    it('removes only the addressed connection', async () => {
      const userId = await getTestUserId();
      const first = await createFirstConnection({
        apiKey: 'key-that-goes-away',
      });
      const second = await createSecondConnection();

      const removed = await helpers.deleteAiConnection({
        id: first.id,
        raw: true,
      });

      expect(removed.success).toBe(true);
      expect(await helpers.getAiConnections({ raw: true })).toEqual([second]);
      expect((await readStoredConnections({ userId })).map(({ id }) => id)).toEqual([second.id]);
    });

    it('drops feature picks of the removed connection and keeps every other pick', async () => {
      enableServerModel();
      const userId = await getTestUserId();
      const first = await createFirstConnection();
      const second = await createSecondConnection();

      await helpers.setAiFeatureConfig({
        feature: AI_FEATURE.categorization,
        connectionId: first.id,
      });
      await helpers.setAiFeatureConfig({
        feature: AI_FEATURE.statementParsing,
        connectionId: second.id,
      });
      await helpers.setAiFeatureConfig({
        feature: AI_FEATURE.investmentTransactionsParsing,
        connectionId: null,
      });

      await helpers.deleteAiConnection({ id: first.id });

      expect(await readStoredFeatureConfigs({ userId })).toEqual([
        { feature: AI_FEATURE.statementParsing, connectionId: second.id },
        {
          feature: AI_FEATURE.investmentTransactionsParsing,
          connectionId: null,
        },
      ]);

      const categorization = await helpers.getAiFeatureConfig({
        feature: AI_FEATURE.categorization,
        raw: true,
      });
      expect(categorization).toMatchObject({
        isConfigured: false,
        connectionId: second.id,
      });
    });
  });

  describe('POST /user/settings/ai/connections/:id/default', () => {
    it('moves the connection to the front of the list', async () => {
      const userId = await getTestUserId();
      const first = await createFirstConnection();
      const second = await createSecondConnection();
      const third = await createOpenAiConnection();

      const reordered = await helpers.setDefaultAiConnection({
        id: third.id,
        raw: true,
      });

      expect(reordered).toEqual([third, first, second]);
      expect(await helpers.getAiConnections({ raw: true })).toEqual([third, first, second]);
      expect((await readStoredConnections({ userId })).map(({ id }) => id)).toEqual([third.id, first.id, second.id]);
    });

    it('keeps the order when the connection is already the default', async () => {
      const first = await createFirstConnection();
      const second = await createSecondConnection();

      expect(await helpers.setDefaultAiConnection({ id: first.id, raw: true })).toEqual([first, second]);
    });
  });

  describe('POST /user/settings/ai/connections/test', () => {
    it('reports a working combination as valid without persisting it', async () => {
      const result = await helpers.testAiConnection({
        provider: AI_PROVIDER.custom,
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        model: CUSTOM_ENDPOINT_MODEL,
        raw: true,
      });

      expect(result).toEqual({ isValid: true });
      expect(await helpers.getAiConnections({ raw: true })).toEqual([]);
    });

    it('returns 200 with isValid=false and an error when the server demands a key', async () => {
      global.mswMockServer.use(getCustomEndpointAuthErrorMock());

      const response = await helpers.testAiConnection({
        provider: AI_PROVIDER.custom,
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        model: CUSTOM_ENDPOINT_MODEL,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body.response.isValid).toBe(false);
      expect(response.body.response.error).toEqual(expect.any(String));
    });

    it('reports a model the server does not serve as invalid', async () => {
      global.mswMockServer.use(getCustomEndpointModelNotFoundMock());

      const result = await helpers.testAiConnection({
        provider: AI_PROVIDER.custom,
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        model: CUSTOM_ENDPOINT_MODEL,
        raw: true,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toEqual(expect.any(String));
    });

    it('rejects a guard-blocked URL with 422 instead of isValid=false', async () => {
      runAsCloud();

      const response = await helpers.testAiConnection({
        provider: AI_PROVIDER.custom,
        baseUrl: 'http://169.254.169.254/latest',
        model: CUSTOM_ENDPOINT_MODEL,
      });

      expect(response.statusCode).toBe(422);
    });

    // A closed tunnel answers 404 with its own error page on every path, model probe included.
    it('blames the server, not the model, when a web page answers instead of the API', async () => {
      global.mswMockServer.use(...getCustomEndpointWebPageMocks());

      const result = await helpers.testAiConnection({
        provider: AI_PROVIDER.custom,
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        model: CUSTOM_ENDPOINT_MODEL,
        raw: true,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('404');
      expect(result.error).not.toContain(CUSTOM_ENDPOINT_MODEL);
    });

    describe('native providers', () => {
      beforeEach(() => {
        global.mswMockServer.use(createGeminiMock({ expectedModel: GOOGLE_MODEL }));
      });

      it.each(NATIVE_CASES)(
        'tells a working $provider key from a refused one',
        async ({ provider, model, validKey, invalidKey }) => {
          const working = await helpers.testAiConnection({
            provider,
            model,
            apiKey: validKey,
            raw: true,
          });
          const refused = await helpers.testAiConnection({
            provider,
            model,
            apiKey: invalidKey,
          });

          expect(working).toEqual({ isValid: true });
          expect(refused.statusCode).toBe(200);
          expect(refused.body.response.isValid).toBe(false);
          expect(refused.body.response.error).toEqual(expect.any(String));
        },
      );

      it('reports a missing key as invalid without dialling the provider', async () => {
        const calls = countCalls({ url: OPENAI_RESPONSES_URL });

        const result = await helpers.testAiConnection({
          provider: AI_PROVIDER.openai,
          model: OPENAI_MODEL,
          raw: true,
        });

        expect(result.isValid).toBe(false);
        expect(result.error).toEqual(expect.any(String));
        expect(calls.count).toBe(0);
      });

      it('tells a model the provider does not serve apart from a rejected key', async () => {
        const unknownModel = await helpers.testAiConnection({
          provider: AI_PROVIDER.openai,
          model: OPENAI_UNKNOWN_MODEL,
          apiKey: VALID_OPENAI_API_KEY,
          raw: true,
        });
        const keyRejected = await helpers.testAiConnection({
          provider: AI_PROVIDER.openai,
          model: OPENAI_MODEL,
          apiKey: INVALID_OPENAI_API_KEY,
          raw: true,
        });

        expect(unknownModel.isValid).toBe(false);
        expect(keyRejected.isValid).toBe(false);
        expect(unknownModel.error).not.toBe(keyRejected.error);
      });

      it('borrows the key of a same-provider connection for a draft', async () => {
        const source = await createOpenAiConnection();

        const result = await helpers.testAiConnection({
          provider: AI_PROVIDER.openai,
          model: OPENAI_LISTED_MODELS[2]!,
          keyFromConnectionId: source.id,
          raw: true,
        });

        expect(result).toEqual({ isValid: true });
      });

      it('refuses to borrow the key of another provider and never sends it there', async () => {
        const source = await createOpenAiConnection();
        const anthropicCalls = countCalls({ url: ANTHROPIC_API_URL });

        const response = await helpers.testAiConnection({
          provider: AI_PROVIDER.anthropic,
          model: ANTHROPIC_MODEL,
          keyFromConnectionId: source.id,
        });

        expect(response.statusCode).toBe(422);
        expect(anthropicCalls.count).toBe(0);
      });

      it('re-tests a saved native connection with its stored key', async () => {
        const created = await createOpenAiConnection();

        expect(
          await helpers.testAiConnection({
            connectionId: created.id,
            raw: true,
          }),
        ).toEqual({ isValid: true });
      });

      it('never sends a saved native key to a base URL from the request', async () => {
        const created = await createOpenAiConnection();
        const probes = countChatCalls();

        const response = await helpers.testAiConnection({
          connectionId: created.id,
          baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        });

        expect(response.statusCode).toBe(422);
        expect(probes.count).toBe(0);
      });
    });

    it('falls back to the saved base URL, model and key', async () => {
      const created = await createFirstConnection({
        apiKey: VALID_CUSTOM_ENDPOINT_API_KEY,
      });

      global.mswMockServer.use(
        getCustomEndpointRequireKeyMock({
          apiKey: VALID_CUSTOM_ENDPOINT_API_KEY,
        }),
      );

      const result = await helpers.testAiConnection({
        connectionId: created.id,
        raw: true,
      });

      expect(result.isValid).toBe(true);
    });

    it('prefers a key supplied in the request over the saved one', async () => {
      const created = await createFirstConnection({
        apiKey: VALID_CUSTOM_ENDPOINT_API_KEY,
      });

      global.mswMockServer.use(
        getCustomEndpointRequireKeyMock({
          apiKey: VALID_CUSTOM_ENDPOINT_API_KEY,
        }),
      );

      const result = await helpers.testAiConnection({
        connectionId: created.id,
        apiKey: 'a-different-key',
        raw: true,
      });

      expect(result.isValid).toBe(false);
    });

    it('uses only the connection the id names', async () => {
      const first = await createFirstConnection();
      const second = await createSecondConnection();

      global.mswMockServer.use(getCustomEndpointAuthErrorMock({ baseUrl: CUSTOM_ENDPOINT_BASE_URL }));

      const onSecond = await helpers.testAiConnection({
        connectionId: second.id,
        raw: true,
      });
      const onFirst = await helpers.testAiConnection({
        connectionId: first.id,
        raw: true,
      });

      expect(onSecond.isValid).toBe(true);
      expect(onFirst.isValid).toBe(false);
    });

    it('mirrors test results into the stored status, except for overridden fields', async () => {
      const created = await createFirstConnection();

      // Successive `use()` calls shadow earlier overrides; `resetHandlers()` would drop
      // overrides other parts of this test rely on.
      global.mswMockServer.use(getCustomEndpointAuthErrorMock());
      const overridden = await helpers.testAiConnection({
        connectionId: created.id,
        apiKey: INVALID_CUSTOM_ENDPOINT_API_KEY,
        raw: true,
      });

      expect(overridden.isValid).toBe(false);

      const [afterOverride] = await helpers.getAiConnections({ raw: true });
      expect(afterOverride!.status).toBe('valid');
      expect(afterOverride!.lastError).toBeUndefined();

      global.mswMockServer.use(getCustomEndpointOfflineMock());
      const offline = await helpers.testAiConnection({
        connectionId: created.id,
        raw: true,
      });

      expect(offline.isValid).toBe(false);

      const [afterOffline] = await helpers.getAiConnections({ raw: true });
      expect(afterOffline!.status).toBe('invalid');
      expect(afterOffline!.lastError).toBe(offline.error);
      expect(afterOffline!.invalidatedAt).toEqual(expect.any(String));

      global.mswMockServer.use(getCustomEndpointSuccessMock());
      const recovered = await helpers.testAiConnection({
        connectionId: created.id,
        raw: true,
      });

      expect(recovered.isValid).toBe(true);

      const [afterRecovery] = await helpers.getAiConnections({ raw: true });
      expect(afterRecovery!.status).toBe('valid');
      expect(afterRecovery!.lastError).toBeUndefined();
      expect(afterRecovery!.invalidatedAt).toBeUndefined();
    }, 30_000);
  });

  describe('Ids that address no saved connection', () => {
    it('refuses ids that address no saved connection', async () => {
      expect((await helpers.deleteAiConnection({ id: randomUUID() })).statusCode).toBe(404);
      expect((await helpers.setDefaultAiConnection({ id: randomUUID() })).statusCode).toBe(404);
      expect((await helpers.testAiConnection({ connectionId: randomUUID() })).statusCode).toBe(404);
      expect(
        (
          await helpers.testAiConnection({
            model: CUSTOM_ENDPOINT_MODEL,
          } as unknown as TestAIConnectionBody)
        ).statusCode,
      ).toBe(422);
      expect(
        (
          await helpers.updateAiConnection({
            id: 'not-a-uuid',
            name: 'Nowhere',
          })
        ).statusCode,
      ).toBe(422);
      expect((await helpers.setDefaultAiConnection({ id: 'not-a-uuid' })).statusCode).toBe(422);

      await createFirstConnection();

      expect(
        (
          await helpers.updateAiConnection({
            id: randomUUID(),
            name: 'Nowhere',
          })
        ).statusCode,
      ).toBe(404);
      expect((await helpers.deleteAiConnection({ id: randomUUID() })).statusCode).toBe(404);
      expect((await helpers.setDefaultAiConnection({ id: randomUUID() })).statusCode).toBe(404);
    });
  });

  describe('Outbound probe rate limit', () => {
    it('spends one per-user budget across test, create and update, and gives each user their own', async () => {
      for (let attempt = 1; attempt <= PROBE_BUDGET_PER_MINUTE; attempt++) {
        const response = await helpers.testAiConnection({
          provider: AI_PROVIDER.custom,
          baseUrl: CUSTOM_ENDPOINT_BASE_URL,
          model: CUSTOM_ENDPOINT_MODEL,
        });
        expect(response.statusCode).toBe(200);
      }

      const blocked = await helpers.testAiConnection({
        provider: AI_PROVIDER.custom,
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        model: CUSTOM_ENDPOINT_MODEL,
      });

      expect(blocked.statusCode).toBe(429);
      expect((blocked.body as unknown as { response?: { code?: string } }).response?.code).toBe(
        API_ERROR_CODES.tooManyRequests,
      );

      const created = await helpers.createAiConnection({
        provider: AI_PROVIDER.custom,
        name: FIRST_CONNECTION_NAME,
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        model: CUSTOM_ENDPOINT_MODEL,
      });

      expect(created.statusCode).toBe(429);
      expect(await helpers.getAiConnections({ raw: true })).toEqual([]);

      const updated = await helpers.updateAiConnection({
        id: randomUUID(),
        name: 'Nowhere',
      });
      expect(updated.statusCode).toBe(429);

      const secondUser = await helpers.signUpSecondUser();
      const createdForSecondUser = await helpers.asUser({
        cookies: secondUser.cookies,
        fn: () =>
          helpers.createAiConnection({
            provider: AI_PROVIDER.custom,
            name: FIRST_CONNECTION_NAME,
            baseUrl: CUSTOM_ENDPOINT_BASE_URL,
            model: CUSTOM_ENDPOINT_MODEL,
          }),
      });

      expect(createdForSecondUser.statusCode).toBe(201);
    }, 40_000);
  });
});
