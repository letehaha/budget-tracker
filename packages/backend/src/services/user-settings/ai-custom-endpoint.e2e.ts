import {
  AIKeyProvider,
  AI_CUSTOM_ENDPOINT_NAME_MAX_LENGTH,
  AI_CUSTOM_MODEL_NAME_MAX_LENGTH,
  AI_FEATURE,
  AI_PROVIDER,
  API_ERROR_CODES,
} from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import UserSettings from '@models/user-settings.model';
import { app } from '@root/app';
import { API_PREFIX } from '@root/config';
import { RateLimitService } from '@services/common/rate-limit.service';
import * as helpers from '@tests/helpers';
import {
  FIRST_ENDPOINT_NAME,
  SECOND_ENDPOINT_MODEL,
  SECOND_ENDPOINT_NAME,
  createFirstEndpoint,
  createSecondEndpoint,
  errorMessage,
  getTestUserId,
  readStoredEndpoints,
  readStoredFeatureConfigs,
  seedApiKey,
} from '@tests/helpers/user-settings';
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
import request from 'supertest';

/** A catalog model that is not the default for `statementParsing`. */
const CATALOG_MODEL_ID = 'anthropic/claude-haiku-4-5';

const CUSTOM_MODEL_ID = `custom/${CUSTOM_ENDPOINT_MODEL}`;
const SECOND_CUSTOM_MODEL_ID = `custom/${SECOND_ENDPOINT_MODEL}`;

function countEndpointProbes({ baseUrl = CUSTOM_ENDPOINT_BASE_URL }: { baseUrl?: string } = {}) {
  return createCallsCounter(global.mswMockServer, `${baseUrl}/chat/completions`);
}

/** Puts the key in the state `decryptToken` fails on: encrypted under a different APPLICATION_JWT_SECRET. */
async function corruptStoredKey({ userId, endpointId }: { userId: number; endpointId: string }): Promise<void> {
  const settings = await UserSettings.findOne({ where: { userId } });
  if (!settings) throw new Error('Test user has no settings row');

  const aiSettings = settings.settings.ai ?? {
    apiKeys: [],
    featureConfigs: [],
  };
  settings.settings = {
    ...settings.settings,
    ai: {
      ...aiSettings,
      customEndpoints: (aiSettings.customEndpoints ?? []).map((endpoint) =>
        endpoint.id === endpointId ? { ...endpoint, keyEncrypted: 'unreadable-ciphertext' } : endpoint,
      ),
    },
  };

  await settings.save();
}

/** Self-host stands the outbound URL guard down, which the mock endpoint hosts need. */
function runAsSelfHost() {
  process.env.IS_SELF_HOST = 'true';
}

/** The guard rejects anything that is not a public internet host. */
function runAsCloud() {
  delete process.env.IS_SELF_HOST;
}

async function burnProbeBudget({ attempts }: { attempts: number }) {
  const userId = await getTestUserId();
  await RateLimitService.resetRateLimit(`ai-custom-endpoint-test:user:${userId}`);

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const response = await helpers.testAiCustomEndpoint({
      baseUrl: CUSTOM_ENDPOINT_BASE_URL,
      defaultModel: CUSTOM_ENDPOINT_MODEL,
    });
    expect(response.statusCode).toBe(200);
  }
}

describe('AI custom endpoints', () => {
  // Feature-status responses consult server-side AI keys, so an ambient key in the
  // local environment would flip which model the assertions here see answering.
  const SERVER_KEY_ENV_VARS = [
    'GEMINI_API_KEY',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GROQ_API_KEY',
    'OPENROUTER_API_KEY',
  ] as const;
  const serverKeysBeforeTest = new Map<string, string | undefined>();
  let selfHostFlagBeforeTest: string | undefined;

  beforeEach(() => {
    selfHostFlagBeforeTest = process.env.IS_SELF_HOST;

    for (const envVar of SERVER_KEY_ENV_VARS) {
      serverKeysBeforeTest.set(envVar, process.env[envVar]);
      delete process.env[envVar];
    }
  });

  afterEach(() => {
    if (selfHostFlagBeforeTest === undefined) {
      delete process.env.IS_SELF_HOST;
    } else {
      process.env.IS_SELF_HOST = selfHostFlagBeforeTest;
    }

    for (const envVar of SERVER_KEY_ENV_VARS) {
      const keyBeforeTest = serverKeysBeforeTest.get(envVar);

      if (keyBeforeTest === undefined) {
        delete process.env[envVar];
      } else {
        process.env[envVar] = keyBeforeTest;
      }
    }
  });

  describe('Authentication', () => {
    it('refuses every custom-endpoint route without a session', async () => {
      const endpointId = generateRandomRecordId();

      const listed = await request(app).get(`${API_PREFIX}/user/settings/ai/custom-endpoints`);
      expect(listed.statusCode).toBe(401);

      const created = await request(app).post(`${API_PREFIX}/user/settings/ai/custom-endpoints`).send({
        name: FIRST_ENDPOINT_NAME,
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        defaultModel: CUSTOM_ENDPOINT_MODEL,
      });
      expect(created.statusCode).toBe(401);

      const updated = await request(app)
        .put(`${API_PREFIX}/user/settings/ai/custom-endpoints/${endpointId}`)
        .send({ name: FIRST_ENDPOINT_NAME });
      expect(updated.statusCode).toBe(401);

      const removed = await request(app).delete(`${API_PREFIX}/user/settings/ai/custom-endpoints/${endpointId}`);
      expect(removed.statusCode).toBe(401);

      const tested = await request(app).post(`${API_PREFIX}/user/settings/ai/custom-endpoints/test`).send({});
      expect(tested.statusCode).toBe(401);
    });
  });

  describe('GET /user/settings/ai/custom-endpoints', () => {
    it('returns an empty array when nothing is configured', async () => {
      const endpoints = await helpers.getAiCustomEndpoints({ raw: true });

      expect(endpoints).toEqual([]);
    });

    it('lists both endpoints in creation order without key material', async () => {
      runAsSelfHost();
      const apiKey = 'super-secret-endpoint-key';
      const first = await createFirstEndpoint({ apiKey });
      const second = await createSecondEndpoint({ apiKey: `${apiKey}-two` });

      expect(first.id).not.toBe(second.id);

      const endpoints = await helpers.getAiCustomEndpoints({ raw: true });

      expect(endpoints).toHaveLength(2);
      expect(endpoints.map((endpoint) => endpoint.id)).toEqual([first.id, second.id]);
      expect(endpoints.map((endpoint) => endpoint.name)).toEqual([FIRST_ENDPOINT_NAME, SECOND_ENDPOINT_NAME]);
      expect(endpoints[0]!.baseUrl).toBe(CUSTOM_ENDPOINT_BASE_URL);
      expect(endpoints[1]!.baseUrl).toBe(CUSTOM_ENDPOINT_LOOPBACK_BASE_URL);
      expect(endpoints[1]!.defaultModel).toBe(SECOND_ENDPOINT_MODEL);
      expect(endpoints.every((endpoint) => endpoint.hasApiKey)).toBe(true);
      expect(JSON.stringify(endpoints)).not.toContain(apiKey);
      for (const endpoint of endpoints) {
        expect(endpoint).not.toHaveProperty('keyEncrypted');
        expect(endpoint).not.toHaveProperty('apiKey');
      }
    });
  });

  describe('POST /user/settings/ai/custom-endpoints', () => {
    it('creates an endpoint that answers and returns its info', async () => {
      runAsSelfHost();

      const response = await helpers.createAiCustomEndpoint({
        name: FIRST_ENDPOINT_NAME,
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        defaultModel: CUSTOM_ENDPOINT_MODEL,
      });

      expect(response.statusCode).toBe(201);

      const created = response.body.response;
      expect(created.id).toEqual(expect.any(String));
      expect(created.name).toBe(FIRST_ENDPOINT_NAME);
      expect(created.baseUrl).toBe(CUSTOM_ENDPOINT_BASE_URL);
      expect(created.defaultModel).toBe(CUSTOM_ENDPOINT_MODEL);
      expect(created.hasApiKey).toBe(false);
      expect(created.status).toBe('valid');
      expect(created.lastValidatedAt).toEqual(expect.any(String));
      expect(created.createdAt).toEqual(expect.any(String));
      expect(created.lastError).toBeUndefined();
      expect(created.invalidatedAt).toBeUndefined();
    });

    it('rejects a name already taken, regardless of case, and persists nothing new', async () => {
      runAsSelfHost();
      await createFirstEndpoint();

      const response = await helpers.createAiCustomEndpoint({
        name: FIRST_ENDPOINT_NAME.toUpperCase(),
        baseUrl: CUSTOM_ENDPOINT_LOOPBACK_BASE_URL,
        defaultModel: SECOND_ENDPOINT_MODEL,
      });

      expect(response.statusCode).toBe(422);
      expect(await helpers.getAiCustomEndpoints({ raw: true })).toHaveLength(1);
    });

    it('rejects malformed create payloads and persists nothing', async () => {
      runAsSelfHost();

      const invalidPayloads = [
        {
          name: '   ',
          baseUrl: CUSTOM_ENDPOINT_BASE_URL,
          defaultModel: CUSTOM_ENDPOINT_MODEL,
        },
        {
          name: 'e'.repeat(AI_CUSTOM_ENDPOINT_NAME_MAX_LENGTH + 1),
          baseUrl: CUSTOM_ENDPOINT_BASE_URL,
          defaultModel: CUSTOM_ENDPOINT_MODEL,
        },
        {
          name: FIRST_ENDPOINT_NAME,
          baseUrl: `${CUSTOM_ENDPOINT_BASE_URL}/${'p'.repeat(500)}`,
          defaultModel: CUSTOM_ENDPOINT_MODEL,
        },
        {
          name: FIRST_ENDPOINT_NAME,
          baseUrl: CUSTOM_ENDPOINT_BASE_URL,
          defaultModel: 'm'.repeat(AI_CUSTOM_MODEL_NAME_MAX_LENGTH + 1),
        },
        {
          name: FIRST_ENDPOINT_NAME,
          baseUrl: 'not-a-url',
          defaultModel: CUSTOM_ENDPOINT_MODEL,
        },
      ];

      for (const payload of invalidPayloads) {
        const response = await helpers.createAiCustomEndpoint(payload);
        expect({ payload, statusCode: response.statusCode }).toStrictEqual({
          payload,
          statusCode: 422,
        });
      }

      expect(await helpers.getAiCustomEndpoints({ raw: true })).toEqual([]);
    });

    it('trims the name and model and strips trailing slashes from the base URL', async () => {
      runAsSelfHost();

      const created = await helpers.createAiCustomEndpoint({
        name: `  ${FIRST_ENDPOINT_NAME}  `,
        baseUrl: `${CUSTOM_ENDPOINT_BASE_URL}//`,
        defaultModel: `  ${CUSTOM_ENDPOINT_MODEL}  `,
        raw: true,
      });

      expect(created.name).toBe(FIRST_ENDPOINT_NAME);
      expect(created.baseUrl).toBe(CUSTOM_ENDPOINT_BASE_URL);
      expect(created.defaultModel).toBe(CUSTOM_ENDPOINT_MODEL);
    });

    it('stores the API key encrypted', async () => {
      runAsSelfHost();
      const userId = await getTestUserId();
      const apiKey = 'super-secret-endpoint-key';

      const created = await createFirstEndpoint({ apiKey });
      expect(created.hasApiKey).toBe(true);

      const [stored] = await readStoredEndpoints({ userId });
      expect(stored?.keyEncrypted).toEqual(expect.any(String));
      expect(stored?.keyEncrypted).not.toBe(apiKey);
    });

    it('rejects an endpoint that answers 401 and persists nothing', async () => {
      runAsSelfHost();

      const response = await helpers.createAiCustomEndpoint({
        name: FIRST_ENDPOINT_NAME,
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        defaultModel: CUSTOM_ENDPOINT_MODEL,
        apiKey: INVALID_CUSTOM_ENDPOINT_API_KEY,
      });

      expect(response.statusCode).toBe(422);
      expect(await helpers.getAiCustomEndpoints({ raw: true })).toEqual([]);
    });

    it('rejects a model the endpoint does not serve and persists nothing', async () => {
      runAsSelfHost();

      const response = await helpers.createAiCustomEndpoint({
        name: FIRST_ENDPOINT_NAME,
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        defaultModel: CUSTOM_ENDPOINT_UNKNOWN_MODEL,
      });

      expect(response.statusCode).toBe(422);
      expect(await helpers.getAiCustomEndpoints({ raw: true })).toEqual([]);
    });

    it('leaves already saved endpoints untouched when a create fails', async () => {
      runAsSelfHost();
      const first = await createFirstEndpoint();

      const response = await helpers.createAiCustomEndpoint({
        name: SECOND_ENDPOINT_NAME,
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        defaultModel: CUSTOM_ENDPOINT_UNKNOWN_MODEL,
      });

      expect(response.statusCode).toBe(422);
      expect(await helpers.getAiCustomEndpoints({ raw: true })).toEqual([first]);
    });

    it('tells an unreachable endpoint apart from one that rejects the key', async () => {
      runAsSelfHost();

      const unreachable = await helpers.createAiCustomEndpoint({
        name: FIRST_ENDPOINT_NAME,
        baseUrl: CUSTOM_ENDPOINT_OFFLINE_BASE_URL,
        defaultModel: CUSTOM_ENDPOINT_MODEL,
      });
      const keyRejected = await helpers.createAiCustomEndpoint({
        name: SECOND_ENDPOINT_NAME,
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        defaultModel: CUSTOM_ENDPOINT_MODEL,
        apiKey: INVALID_CUSTOM_ENDPOINT_API_KEY,
      });

      expect(unreachable.statusCode).toBe(422);
      expect(keyRejected.statusCode).toBe(422);
      expect(errorMessage({ response: unreachable })).toEqual(expect.any(String));
      expect(errorMessage({ response: unreachable })).not.toBe(errorMessage({ response: keyRejected }));
      expect(await helpers.getAiCustomEndpoints({ raw: true })).toEqual([]);
    }, 30_000);

    it('refuses an endpoint beyond the per-user cap and keeps the stored ones', async () => {
      runAsSelfHost();

      for (let index = 1; index <= 5; index++) {
        const response = await helpers.createAiCustomEndpoint({
          name: `Endpoint ${index}`,
          baseUrl: CUSTOM_ENDPOINT_BASE_URL,
          defaultModel: CUSTOM_ENDPOINT_MODEL,
        });

        expect(response.statusCode).toBe(201);
      }

      const overCap = await helpers.createAiCustomEndpoint({
        name: 'Endpoint 6',
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        defaultModel: CUSTOM_ENDPOINT_MODEL,
      });

      expect(overCap.statusCode).toBe(422);
      expect(await helpers.getAiCustomEndpoints({ raw: true })).toHaveLength(5);
    }, 30_000);

    it('saves a model the endpoint lists without asking it to generate', async () => {
      runAsSelfHost();

      const probes = countEndpointProbes({
        baseUrl: CUSTOM_ENDPOINT_LISTING_BASE_URL,
      });

      const created = await helpers.createAiCustomEndpoint({
        name: FIRST_ENDPOINT_NAME,
        baseUrl: CUSTOM_ENDPOINT_LISTING_BASE_URL,
        defaultModel: CUSTOM_ENDPOINT_MODEL,
        raw: true,
      });

      expect(created.status).toBe('valid');
      expect(probes.count).toBe(0);
    });

    it('rejects a model missing from the endpoint model list and says what it offers', async () => {
      runAsSelfHost();

      const response = await helpers.createAiCustomEndpoint({
        name: FIRST_ENDPOINT_NAME,
        baseUrl: CUSTOM_ENDPOINT_LISTING_BASE_URL,
        defaultModel: CUSTOM_ENDPOINT_UNKNOWN_MODEL,
      });

      expect(response.statusCode).toBe(422);
      expect(errorMessage({ response })).toContain(CUSTOM_ENDPOINT_UNKNOWN_MODEL);
      expect(errorMessage({ response })).toContain(CUSTOM_ENDPOINT_LISTED_MODELS[0]);
      expect(await helpers.getAiCustomEndpoints({ raw: true })).toEqual([]);
    });

    it('rejects a model missing from a list served at a base URL that also answers generate calls', async () => {
      runAsSelfHost();
      global.mswMockServer.use(
        getCustomEndpointModelListMock({
          baseUrl: CUSTOM_ENDPOINT_BASE_URL,
          modelIds: ['phi4'],
        }),
      );

      const response = await helpers.createAiCustomEndpoint({
        name: FIRST_ENDPOINT_NAME,
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        defaultModel: CUSTOM_ENDPOINT_MODEL,
      });

      expect(response.statusCode).toBe(422);
      expect(errorMessage({ response })).toContain('phi4');
      expect(await helpers.getAiCustomEndpoints({ raw: true })).toEqual([]);
    });

    it('rejects an endpoint whose model list refuses the key, without a generate call', async () => {
      runAsSelfHost();

      global.mswMockServer.use(
        getCustomEndpointModelListAuthErrorMock({
          baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        }),
      );
      const probes = countEndpointProbes();

      const response = await helpers.createAiCustomEndpoint({
        name: FIRST_ENDPOINT_NAME,
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        defaultModel: CUSTOM_ENDPOINT_MODEL,
      });

      expect(response.statusCode).toBe(422);
      expect(errorMessage({ response })).not.toContain(CUSTOM_ENDPOINT_MODEL);
      expect(probes.count).toBe(0);
      expect(await helpers.getAiCustomEndpoints({ raw: true })).toEqual([]);
    });

    it('allows a loopback endpoint on a self-hosted instance', async () => {
      runAsSelfHost();
      global.mswMockServer.use(
        getCustomEndpointSuccessMock({
          baseUrl: CUSTOM_ENDPOINT_LOOPBACK_BASE_URL,
        }),
      );

      const created = await helpers.createAiCustomEndpoint({
        name: SECOND_ENDPOINT_NAME,
        baseUrl: CUSTOM_ENDPOINT_LOOPBACK_BASE_URL,
        defaultModel: CUSTOM_ENDPOINT_MODEL,
        raw: true,
      });

      expect(created.baseUrl).toBe(CUSTOM_ENDPOINT_LOOPBACK_BASE_URL);
      expect(created.status).toBe('valid');
    });
  });

  describe('POST /user/settings/ai/custom-endpoints – outbound URL guard (cloud)', () => {
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

      const response = await helpers.createAiCustomEndpoint({
        name: FIRST_ENDPOINT_NAME,
        baseUrl,
        defaultModel: CUSTOM_ENDPOINT_MODEL,
      });

      expect(response.statusCode).toBe(422);
      expect(await helpers.getAiCustomEndpoints({ raw: true })).toEqual([]);
    });
  });

  describe('PUT /user/settings/ai/custom-endpoints/:id', () => {
    it('renames without making an outbound call and keeps the validation state', async () => {
      runAsSelfHost();
      const created = await createFirstEndpoint();

      const probes = countEndpointProbes();

      const renamed = await helpers.updateAiCustomEndpoint({
        id: created.id,
        name: 'Renamed Ollama',
        raw: true,
      });

      expect(probes.count).toBe(0);
      expect(renamed.name).toBe('Renamed Ollama');
      expect(renamed.baseUrl).toBe(created.baseUrl);
      expect(renamed.defaultModel).toBe(created.defaultModel);
      expect(renamed.status).toBe(created.status);
      expect(renamed.lastValidatedAt).toBe(created.lastValidatedAt);
    });

    it('re-runs the live check when the model changes', async () => {
      runAsSelfHost();
      const created = await createFirstEndpoint();

      const probes = countEndpointProbes();

      const updated = await helpers.updateAiCustomEndpoint({
        id: created.id,
        defaultModel: 'model-after-update',
        raw: true,
      });

      expect(probes.count).toBe(1);
      expect(updated.defaultModel).toBe('model-after-update');
      expect(updated.status).toBe('valid');
    });

    it('keeps the stored key when apiKey is omitted', async () => {
      runAsSelfHost();
      const created = await createFirstEndpoint({
        apiKey: VALID_CUSTOM_ENDPOINT_API_KEY,
      });

      // Only the stored key gets a 200, so a passing update proves it was sent
      global.mswMockServer.use(
        getCustomEndpointRequireKeyMock({
          apiKey: VALID_CUSTOM_ENDPOINT_API_KEY,
        }),
      );

      const updated = await helpers.updateAiCustomEndpoint({
        id: created.id,
        defaultModel: 'model-after-update',
        raw: true,
      });

      expect(updated.hasApiKey).toBe(true);
      expect(updated.defaultModel).toBe('model-after-update');
    });

    it('removes the stored key when apiKey is null', async () => {
      runAsSelfHost();
      const userId = await getTestUserId();
      const created = await createFirstEndpoint({
        apiKey: 'key-to-be-removed',
      });

      const updated = await helpers.updateAiCustomEndpoint({
        id: created.id,
        apiKey: null,
        raw: true,
      });

      expect(updated.hasApiKey).toBe(false);
      const [stored] = await readStoredEndpoints({ userId });
      expect(stored?.keyEncrypted).toBeUndefined();
    });

    it('removes the stored key even when the endpoint then refuses anonymous calls', async () => {
      runAsSelfHost();
      const userId = await getTestUserId();
      const created = await createFirstEndpoint({
        apiKey: VALID_CUSTOM_ENDPOINT_API_KEY,
      });

      global.mswMockServer.use(
        getCustomEndpointRequireKeyMock({
          apiKey: VALID_CUSTOM_ENDPOINT_API_KEY,
        }),
      );

      const updated = await helpers.updateAiCustomEndpoint({
        id: created.id,
        apiKey: null,
        raw: true,
      });

      expect(updated.hasApiKey).toBe(false);
      expect(updated.status).toBe('invalid');
      expect(updated.lastError).toEqual(expect.any(String));
      expect(updated.invalidatedAt).toEqual(expect.any(String));

      const [stored] = await readStoredEndpoints({ userId });
      expect(stored?.keyEncrypted).toBeUndefined();

      const [listed] = await helpers.getAiCustomEndpoints({ raw: true });
      expect(listed?.hasApiKey).toBe(false);
      expect(listed?.status).toBe('invalid');
    });

    it('replaces the stored key when apiKey is a string', async () => {
      runAsSelfHost();
      const created = await createFirstEndpoint({ apiKey: 'first-key' });

      global.mswMockServer.use(getCustomEndpointRequireKeyMock({ apiKey: 'second-key' }));

      const updated = await helpers.updateAiCustomEndpoint({
        id: created.id,
        apiKey: 'second-key',
        raw: true,
      });
      expect(updated.hasApiKey).toBe(true);

      // Re-testing with no key in the body proves the replacement is what got stored
      const result = await helpers.testAiCustomEndpoint({
        endpointId: created.id,
        raw: true,
      });
      expect(result.isValid).toBe(true);
    });

    it('updates only the addressed endpoint', async () => {
      runAsSelfHost();
      const first = await createFirstEndpoint();
      const second = await createSecondEndpoint();

      await helpers.updateAiCustomEndpoint({
        id: first.id,
        name: 'Renamed Ollama',
      });

      const endpoints = await helpers.getAiCustomEndpoints({ raw: true });
      expect(endpoints.find((endpoint) => endpoint.id === second.id)).toEqual(second);
    });

    it('rejects a rename onto another endpoint name', async () => {
      runAsSelfHost();
      await createFirstEndpoint();
      const second = await createSecondEndpoint();

      const response = await helpers.updateAiCustomEndpoint({
        id: second.id,
        name: FIRST_ENDPOINT_NAME,
      });

      expect(response.statusCode).toBe(422);
    });

    it('accepts a rename that only changes the casing of its own name', async () => {
      runAsSelfHost();
      const created = await createFirstEndpoint();

      const renamed = await helpers.updateAiCustomEndpoint({
        id: created.id,
        name: FIRST_ENDPOINT_NAME.toUpperCase(),
        raw: true,
      });

      expect(renamed.name).toBe(FIRST_ENDPOINT_NAME.toUpperCase());
    });

    it('leaves the endpoint untouched when revalidation fails', async () => {
      runAsSelfHost();
      const created = await createFirstEndpoint();

      const response = await helpers.updateAiCustomEndpoint({
        id: created.id,
        defaultModel: CUSTOM_ENDPOINT_UNKNOWN_MODEL,
      });

      expect(response.statusCode).toBe(422);
      expect(await helpers.getAiCustomEndpoints({ raw: true })).toEqual([created]);
    });

    it('applies the outbound URL guard to a changed base URL in cloud mode', async () => {
      runAsSelfHost();
      const created = await createFirstEndpoint();

      runAsCloud();
      const response = await helpers.updateAiCustomEndpoint({
        id: created.id,
        baseUrl: 'http://169.254.169.254/latest',
      });

      expect(response.statusCode).toBe(422);
      expect(await helpers.getAiCustomEndpoints({ raw: true })).toEqual([created]);
    });
  });

  describe('Unreadable stored API key', () => {
    it('refuses every path that falls back to the unreadable key, until it is replaced', async () => {
      runAsSelfHost();
      const userId = await getTestUserId();
      const created = await createFirstEndpoint({
        apiKey: VALID_CUSTOM_ENDPOINT_API_KEY,
      });
      await corruptStoredKey({ userId, endpointId: created.id });

      // The moved URL answers, so a probe that did go out would come back valid
      const movedBaseUrl = `${CUSTOM_ENDPOINT_BASE_URL}/alt`;
      global.mswMockServer.use(getCustomEndpointSuccessMock({ baseUrl: movedBaseUrl }));
      const movedProbes = countEndpointProbes({ baseUrl: movedBaseUrl });

      const updated = await helpers.updateAiCustomEndpoint({
        id: created.id,
        baseUrl: movedBaseUrl,
      });

      expect(updated.statusCode).toBe(422);
      expect(movedProbes.count).toBe(0);

      const [stored] = await readStoredEndpoints({ userId });
      expect(stored?.baseUrl).toBe(CUSTOM_ENDPOINT_BASE_URL);
      expect(stored?.keyEncrypted).toBe('unreadable-ciphertext');

      const connectionTest = await helpers.testAiCustomEndpoint({
        endpointId: created.id,
      });
      expect(connectionTest.statusCode).toBe(422);

      const probes = countEndpointProbes();

      const featureConfig = await helpers.setAiFeatureConfig({
        feature: AI_FEATURE.categorization,
        modelId: CUSTOM_MODEL_ID,
        customEndpointId: created.id,
      });

      expect(featureConfig.statusCode).toBe(422);
      expect(probes.count).toBe(0);
      expect(await readStoredFeatureConfigs({ userId })).toEqual([]);

      // Replacing the key clears the unreadable ciphertext every step above depends on, so it stays last.
      global.mswMockServer.use(getCustomEndpointRequireKeyMock({ apiKey: 'freshly-entered-key' }));

      const replaced = await helpers.updateAiCustomEndpoint({
        id: created.id,
        apiKey: 'freshly-entered-key',
        raw: true,
      });

      expect(replaced.hasApiKey).toBe(true);
      expect(replaced.status).toBe('valid');
    }, 30_000);
  });

  describe('DELETE /user/settings/ai/custom-endpoints/:id', () => {
    it('removes only the addressed endpoint', async () => {
      runAsSelfHost();
      const first = await createFirstEndpoint({ apiKey: 'key-that-goes-away' });
      const second = await createSecondEndpoint();

      const removed = await helpers.deleteAiCustomEndpoint({
        id: first.id,
        raw: true,
      });

      expect(removed.success).toBe(true);
      expect(await helpers.getAiCustomEndpoints({ raw: true })).toEqual([second]);
      const stored = await readStoredEndpoints({
        userId: await getTestUserId(),
      });
      expect(stored.map((endpoint) => endpoint.id)).toEqual([second.id]);
    });

    it('drops a config bound to the removed endpoint when no key provider remains', async () => {
      runAsSelfHost();
      const first = await createFirstEndpoint();
      await helpers.setAiFeatureConfig({
        feature: AI_FEATURE.categorization,
        modelId: CUSTOM_MODEL_ID,
        customEndpointId: first.id,
      });

      await helpers.deleteAiCustomEndpoint({ id: first.id });

      const config = await helpers.getAiFeatureConfig({
        feature: AI_FEATURE.categorization,
        raw: true,
      });
      expect(config.isConfigured).toBe(false);
      expect(config.modelId.startsWith('custom/')).toBe(false);
      expect(config.customEndpointId).toBeUndefined();
    });

    it('remaps a config bound to the removed endpoint to a provider the user still has a key for', async () => {
      runAsSelfHost();
      await seedApiKey({
        userId: await getTestUserId(),
        provider: AI_PROVIDER.openai,
      });
      const first = await createFirstEndpoint();
      await helpers.setAiFeatureConfig({
        feature: AI_FEATURE.categorization,
        modelId: CUSTOM_MODEL_ID,
        customEndpointId: first.id,
      });

      await helpers.deleteAiCustomEndpoint({ id: first.id });

      const config = await helpers.getAiFeatureConfig({
        feature: AI_FEATURE.categorization,
        raw: true,
      });
      expect(config.isConfigured).toBe(true);
      expect(config.modelId.startsWith(`${AI_PROVIDER.openai}/`)).toBe(true);
      expect(config.customEndpointId).toBeUndefined();
    });

    it('leaves a config bound to another endpoint byte-identical', async () => {
      runAsSelfHost();
      const userId = await getTestUserId();
      const first = await createFirstEndpoint();
      const second = await createSecondEndpoint();

      await helpers.setAiFeatureConfig({
        feature: AI_FEATURE.categorization,
        modelId: CUSTOM_MODEL_ID,
        customEndpointId: first.id,
      });
      await helpers.setAiFeatureConfig({
        feature: AI_FEATURE.statementParsing,
        modelId: SECOND_CUSTOM_MODEL_ID,
        customEndpointId: second.id,
      });

      await helpers.deleteAiCustomEndpoint({ id: first.id });

      const survivor = (await readStoredFeatureConfigs({ userId })).find(
        (config) => config.feature === AI_FEATURE.statementParsing,
      );
      expect(survivor).toEqual({
        feature: AI_FEATURE.statementParsing,
        modelId: SECOND_CUSTOM_MODEL_ID,
        customEndpointId: second.id,
      });

      const status = await helpers.getAiFeatureConfig({
        feature: AI_FEATURE.statementParsing,
        raw: true,
      });
      expect(status.endpointName).toBe(SECOND_ENDPOINT_NAME);
      expect(status.usingUserKey).toBe(true);
    });

    it('leaves catalog-model configs alone', async () => {
      runAsSelfHost();
      const first = await createFirstEndpoint();
      await helpers.setAiFeatureConfig({
        feature: AI_FEATURE.statementParsing,
        modelId: CATALOG_MODEL_ID,
      });
      await helpers.setAiFeatureConfig({
        feature: AI_FEATURE.categorization,
        modelId: CUSTOM_MODEL_ID,
        customEndpointId: first.id,
      });

      await helpers.deleteAiCustomEndpoint({ id: first.id });

      const statementParsing = await helpers.getAiFeatureConfig({
        feature: AI_FEATURE.statementParsing,
        raw: true,
      });
      expect(statementParsing.isConfigured).toBe(true);
      expect(statementParsing.modelId).toBe(CATALOG_MODEL_ID);
    });
  });

  describe('custom/* feature configs', () => {
    it('accepts a custom model that names one of the saved endpoints', async () => {
      runAsSelfHost();
      const first = await createFirstEndpoint();

      const config = await helpers.setAiFeatureConfig({
        feature: AI_FEATURE.categorization,
        modelId: CUSTOM_MODEL_ID,
        customEndpointId: first.id,
        raw: true,
      });

      expect(config.modelId).toBe(CUSTOM_MODEL_ID);
      expect(config.modelName).toBe(CUSTOM_ENDPOINT_MODEL);
      expect(config.customEndpointId).toBe(first.id);
      expect(config.endpointName).toBe(FIRST_ENDPOINT_NAME);
      expect(config.isConfigured).toBe(true);
      expect(config.usingUserKey).toBe(true);
    });

    it('keeps every segment after the prefix as the model name', async () => {
      runAsSelfHost();
      const first = await createFirstEndpoint();

      const config = await helpers.setAiFeatureConfig({
        feature: AI_FEATURE.categorization,
        modelId: 'custom/library/llama3.2:8b',
        customEndpointId: first.id,
        raw: true,
      });

      expect(config.modelName).toBe('library/llama3.2:8b');
    });

    it('rejects malformed custom model configs', async () => {
      runAsSelfHost();
      const first = await createFirstEndpoint();

      const withoutEndpointId = await helpers.setAiFeatureConfig({
        feature: AI_FEATURE.categorization,
        modelId: CUSTOM_MODEL_ID,
      });
      expect(withoutEndpointId.statusCode).toBe(422);

      const unknownEndpointId = await helpers.setAiFeatureConfig({
        feature: AI_FEATURE.categorization,
        modelId: CUSTOM_MODEL_ID,
        customEndpointId: generateRandomRecordId(),
      });
      expect(unknownEndpointId.statusCode).toBe(422);

      const emptyModelName = await helpers.setAiFeatureConfig({
        feature: AI_FEATURE.categorization,
        modelId: 'custom/',
        customEndpointId: first.id,
      });
      expect(emptyModelName.statusCode).toBe(422);

      const config = await helpers.getAiFeatureConfig({
        feature: AI_FEATURE.categorization,
        raw: true,
      });
      expect(config.isConfigured).toBe(false);
    });

    it('rejects a custom model when the user has no endpoints at all', async () => {
      const response = await helpers.setAiFeatureConfig({
        feature: AI_FEATURE.categorization,
        modelId: CUSTOM_MODEL_ID,
        customEndpointId: generateRandomRecordId(),
      });

      expect(response.statusCode).toBe(422);
    });

    it('ignores customEndpointId for a catalog model', async () => {
      runAsSelfHost();
      const userId = await getTestUserId();
      const first = await createFirstEndpoint();

      await helpers.setAiFeatureConfig({
        feature: AI_FEATURE.statementParsing,
        modelId: CATALOG_MODEL_ID,
        customEndpointId: first.id,
        raw: true,
      });

      const stored = (await readStoredFeatureConfigs({ userId })).find(
        (config) => config.feature === AI_FEATURE.statementParsing,
      );
      expect(stored).toEqual({
        feature: AI_FEATURE.statementParsing,
        modelId: CATALOG_MODEL_ID,
      });
    });

    it('labels each feature with the endpoint that serves it', async () => {
      runAsSelfHost();
      const first = await createFirstEndpoint();
      const second = await createSecondEndpoint();

      await helpers.setAiFeatureConfig({
        feature: AI_FEATURE.categorization,
        modelId: CUSTOM_MODEL_ID,
        customEndpointId: first.id,
      });
      await helpers.setAiFeatureConfig({
        feature: AI_FEATURE.statementParsing,
        modelId: SECOND_CUSTOM_MODEL_ID,
        customEndpointId: second.id,
      });

      const { features } = await helpers.getAiFeaturesStatus({ raw: true });
      const categorization = features.find((feature) => feature.feature === AI_FEATURE.categorization);
      const statementParsing = features.find((feature) => feature.feature === AI_FEATURE.statementParsing);

      expect(categorization?.modelId).toBe(CUSTOM_MODEL_ID);
      expect(categorization?.modelName).toBe(CUSTOM_ENDPOINT_MODEL);
      expect(categorization?.endpointName).toBe(FIRST_ENDPOINT_NAME);
      expect(categorization?.usingUserKey).toBe(true);

      expect(statementParsing?.modelName).toBe(SECOND_ENDPOINT_MODEL);
      expect(statementParsing?.endpointName).toBe(SECOND_ENDPOINT_NAME);
    });
  });

  describe('POST /user/settings/ai/custom-endpoints/test', () => {
    it('reports a working combination as valid without persisting it', async () => {
      runAsSelfHost();

      const result = await helpers.testAiCustomEndpoint({
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        defaultModel: CUSTOM_ENDPOINT_MODEL,
        raw: true,
      });

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(await helpers.getAiCustomEndpoints({ raw: true })).toEqual([]);
    });

    it('returns 200 with isValid=false and an error when the endpoint demands a key', async () => {
      runAsSelfHost();
      global.mswMockServer.use(getCustomEndpointAuthErrorMock());

      const response = await helpers.testAiCustomEndpoint({
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        defaultModel: CUSTOM_ENDPOINT_MODEL,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body.response.isValid).toBe(false);
      expect(response.body.response.error).toEqual(expect.any(String));
    });

    it('reports a model the endpoint does not serve as invalid', async () => {
      runAsSelfHost();
      global.mswMockServer.use(getCustomEndpointModelNotFoundMock());

      const result = await helpers.testAiCustomEndpoint({
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        defaultModel: CUSTOM_ENDPOINT_MODEL,
        raw: true,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toEqual(expect.any(String));
    });

    it('rejects a guard-blocked URL with 422 instead of isValid=false', async () => {
      runAsCloud();

      const response = await helpers.testAiCustomEndpoint({
        baseUrl: 'http://169.254.169.254/latest',
        defaultModel: CUSTOM_ENDPOINT_MODEL,
      });

      expect(response.statusCode).toBe(422);
    });

    it('falls back to the named endpoint base URL, model and key', async () => {
      runAsSelfHost();
      const created = await createFirstEndpoint({
        apiKey: VALID_CUSTOM_ENDPOINT_API_KEY,
      });

      global.mswMockServer.use(
        getCustomEndpointRequireKeyMock({
          apiKey: VALID_CUSTOM_ENDPOINT_API_KEY,
        }),
      );

      const result = await helpers.testAiCustomEndpoint({
        endpointId: created.id,
        raw: true,
      });

      expect(result.isValid).toBe(true);
    });

    it('prefers a key supplied in the request over the saved one', async () => {
      runAsSelfHost();
      const created = await createFirstEndpoint({
        apiKey: VALID_CUSTOM_ENDPOINT_API_KEY,
      });

      global.mswMockServer.use(
        getCustomEndpointRequireKeyMock({
          apiKey: VALID_CUSTOM_ENDPOINT_API_KEY,
        }),
      );

      const result = await helpers.testAiCustomEndpoint({
        endpointId: created.id,
        apiKey: 'a-different-key',
        raw: true,
      });

      expect(result.isValid).toBe(false);
    });

    it('uses only the endpoint the id names', async () => {
      runAsSelfHost();
      const first = await createFirstEndpoint();
      const second = await createSecondEndpoint();

      global.mswMockServer.use(getCustomEndpointAuthErrorMock({ baseUrl: CUSTOM_ENDPOINT_BASE_URL }));

      const onSecond = await helpers.testAiCustomEndpoint({
        endpointId: second.id,
        raw: true,
      });
      const onFirst = await helpers.testAiCustomEndpoint({
        endpointId: first.id,
        raw: true,
      });

      expect(onSecond.isValid).toBe(true);
      expect(onFirst.isValid).toBe(false);
    });

    // A closed tunnel answers 404 with its own error page on every path, model probe included.
    it('blames the server, not the model, when a web page answers instead of the API', async () => {
      runAsSelfHost();
      global.mswMockServer.use(...getCustomEndpointWebPageMocks());

      const result = await helpers.testAiCustomEndpoint({
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        defaultModel: CUSTOM_ENDPOINT_MODEL,
        raw: true,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('404');
      expect(result.error).not.toContain(CUSTOM_ENDPOINT_MODEL);
    });

    it('mirrors test results into the stored status, except for overridden fields', async () => {
      runAsSelfHost();
      const created = await createFirstEndpoint();

      // Successive `use()` calls shadow earlier overrides; `resetHandlers()` would drop
      // overrides other parts of this test rely on.
      global.mswMockServer.use(getCustomEndpointAuthErrorMock());
      const overridden = await helpers.testAiCustomEndpoint({
        endpointId: created.id,
        apiKey: INVALID_CUSTOM_ENDPOINT_API_KEY,
        raw: true,
      });

      expect(overridden.isValid).toBe(false);

      const [afterOverride] = await helpers.getAiCustomEndpoints({ raw: true });
      expect(afterOverride!.status).toBe('valid');
      expect(afterOverride!.lastError).toBeUndefined();

      global.mswMockServer.use(getCustomEndpointOfflineMock());
      const offline = await helpers.testAiCustomEndpoint({
        endpointId: created.id,
        raw: true,
      });

      expect(offline.isValid).toBe(false);

      const [afterOffline] = await helpers.getAiCustomEndpoints({ raw: true });
      expect(afterOffline!.status).toBe('invalid');
      expect(afterOffline!.lastError).toBe(offline.error);
      expect(afterOffline!.invalidatedAt).toEqual(expect.any(String));

      global.mswMockServer.use(getCustomEndpointSuccessMock());
      const recovered = await helpers.testAiCustomEndpoint({
        endpointId: created.id,
        raw: true,
      });

      expect(recovered.isValid).toBe(true);

      const [afterRecovery] = await helpers.getAiCustomEndpoints({ raw: true });
      expect(afterRecovery!.status).toBe('valid');
      expect(afterRecovery!.lastError).toBeUndefined();
      expect(afterRecovery!.invalidatedAt).toBeUndefined();
    }, 30_000);
  });

  describe('Ids that address no saved endpoint', () => {
    it('refuses ids that address no saved endpoint', async () => {
      runAsSelfHost();

      expect((await helpers.deleteAiCustomEndpoint({ id: generateRandomRecordId() })).statusCode).toBe(404);
      expect(
        (
          await helpers.testAiCustomEndpoint({
            endpointId: generateRandomRecordId(),
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await helpers.testAiCustomEndpoint({
            defaultModel: CUSTOM_ENDPOINT_MODEL,
          })
        ).statusCode,
      ).toBe(422);
      expect(
        (
          await helpers.updateAiCustomEndpoint({
            id: 'not-a-uuid',
            name: 'Nowhere',
          })
        ).statusCode,
      ).toBe(422);

      await createFirstEndpoint();

      expect(
        (
          await helpers.updateAiCustomEndpoint({
            id: generateRandomRecordId(),
            name: 'Nowhere',
          })
        ).statusCode,
      ).toBe(404);
      expect((await helpers.deleteAiCustomEndpoint({ id: generateRandomRecordId() })).statusCode).toBe(404);
    });
  });

  describe('Outbound probe rate limit', () => {
    // The extended timeout covers the budget-burning requests, each with its own outbound probe.
    it('spends one per-user budget across test, create and update, and gives each user their own', async () => {
      runAsSelfHost();
      await burnProbeBudget({ attempts: 15 });

      const blocked = await helpers.testAiCustomEndpoint({
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        defaultModel: CUSTOM_ENDPOINT_MODEL,
      });

      expect(blocked.statusCode).toBe(429);
      const errorBody = blocked.body as unknown as {
        response?: { code?: string };
      };
      expect(errorBody.response?.code).toBe(API_ERROR_CODES.tooManyRequests);

      const created = await helpers.createAiCustomEndpoint({
        name: FIRST_ENDPOINT_NAME,
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        defaultModel: CUSTOM_ENDPOINT_MODEL,
      });

      expect(created.statusCode).toBe(429);
      expect(await helpers.getAiCustomEndpoints({ raw: true })).toEqual([]);

      const updated = await helpers.updateAiCustomEndpoint({
        id: generateRandomRecordId(),
        name: 'Nowhere',
      });
      expect(updated.statusCode).toBe(429);

      const secondUser = await helpers.signUpSecondUser();
      const createdForSecondUser = await helpers.asUser({
        cookies: secondUser.cookies,
        fn: () =>
          helpers.createAiCustomEndpoint({
            name: FIRST_ENDPOINT_NAME,
            baseUrl: CUSTOM_ENDPOINT_BASE_URL,
            defaultModel: CUSTOM_ENDPOINT_MODEL,
          }),
      });

      expect(createdForSecondUser.statusCode).toBe(201);
    }, 40_000);
  });

  describe('Interaction with API key removal', () => {
    it('keeps every custom endpoint when all API keys are deleted', async () => {
      runAsSelfHost();
      await seedApiKey({
        userId: await getTestUserId(),
        provider: AI_PROVIDER.openai,
      });
      const first = await createFirstEndpoint({ apiKey: 'endpoint-key' });
      const second = await createSecondEndpoint();

      await helpers.deleteAllAiApiKeys();

      expect(await helpers.getAiCustomEndpoints({ raw: true })).toEqual([first, second]);
    });
  });

  describe('`custom` is refused by the API key routes', () => {
    const customAsKeyProvider = AI_PROVIDER.custom as unknown as AIKeyProvider;

    it('rejects a key set for custom', async () => {
      const response = await helpers.setAiApiKey({
        provider: customAsKeyProvider,
        apiKey: 'sk-not-a-provider-key',
      });

      expect(response.statusCode).toBe(422);
      expect((await helpers.getAiApiKeyStatus({ raw: true })).hasApiKey).toBe(false);
    });

    it('rejects a key delete for custom', async () => {
      const response = await helpers.deleteAiApiKey({
        provider: customAsKeyProvider,
      });

      expect(response.statusCode).toBe(422);
    });

    it('rejects custom as the default provider', async () => {
      const response = await helpers.setDefaultAiProvider({
        provider: customAsKeyProvider,
      });

      expect(response.statusCode).toBe(422);
      expect((await helpers.getAiApiKeyStatus({ raw: true })).defaultProvider).toBeUndefined();
    });
  });
});
