import { AI_FEATURE, AI_PROVIDER, BANK_PROVIDER_TYPE, isCustomModelId } from '@bt/shared/types';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { logger } from '@js/utils/logger';
import UserSettings from '@models/user-settings.model';
import * as helpers from '@tests/helpers';
import {
  FIRST_ENDPOINT_NAME,
  SECOND_ENDPOINT_MODEL,
  createFirstEndpoint,
  createSecondEndpoint,
  getTestUserId,
  readStoredEndpoints,
  readStoredFeatureConfigs,
  seedApiKey,
} from '@tests/helpers/user-settings';
import { VALID_GEMINI_API_KEY, createGeminiMock } from '@tests/mocks/gemini/mock-api';
import { createCallsCounter } from '@tests/mocks/helpers';
import { VALID_MONOBANK_TOKEN, getMonobankTransactionsMock } from '@tests/mocks/monobank/mock-api';
import {
  CUSTOM_ENDPOINT_BASE_URL,
  CUSTOM_ENDPOINT_LOOPBACK_BASE_URL,
  CUSTOM_ENDPOINT_MODEL,
  getCustomEndpointAuthErrorMock,
  getCustomEndpointCallCountingMock,
  getCustomEndpointModelNotFoundMock,
  getCustomEndpointWebPageMocks,
} from '@tests/mocks/openai-compatible/mock-api';
import { HttpResponse, http } from 'msw';

/**
 * Which endpoint (if any) answers an AI run, end to end.
 *
 * The AI flow has no endpoint of its own — a bank sync emits the event the
 * categorization listener picks up, so every case here drives resolution the
 * way production does and measures the outcome on the endpoint mocks.
 */

const SECOND_CUSTOM_MODEL_ID = `custom/${SECOND_ENDPOINT_MODEL}`;
const FIRST_CUSTOM_MODEL_ID = `custom/${CUSTOM_ENDPOINT_MODEL}`;

/** Live catalog model on a provider no case here holds a key for. */
const KEYLESS_CATALOG_MODEL_ID = 'anthropic/claude-haiku-4-5';

/** Matches every Gemini generate call, so a case can prove the server key was never dialled. */
const GEMINI_API_URL_REGEX = /generativelanguage\.googleapis\.com/;

/**
 * Server keys the resolution ladder can reach for. Each case opts into the one
 * it needs, so all of them start unset.
 */
const SERVER_KEY_ENV_VARS = ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GROQ_API_KEY'] as const;

/** Covers the sync request, the 4s categorization debounce and the queued job. */
const CATEGORIZATION_RUN_MS = 7000;
const CATEGORIZATION_TEST_TIMEOUT_MS = 40_000;

/** Puts an endpoint in the failed state without spending a run or a probe on it. */
async function markStoredEndpointInvalid({
  userId,
  endpointId,
}: {
  userId: number;
  endpointId: string;
}): Promise<void> {
  const settings = await UserSettings.findOne({ where: { userId } });
  if (!settings) throw new Error('Expected the test user to have settings by now');

  const aiSettings = settings.settings.ai ?? { apiKeys: [], featureConfigs: [] };
  const now = new Date().toISOString();

  settings.settings = {
    ...settings.settings,
    ai: {
      ...aiSettings,
      customEndpoints: (aiSettings.customEndpoints ?? []).map((endpoint) =>
        endpoint.id === endpointId
          ? { ...endpoint, status: 'invalid' as const, lastError: 'Seeded failure', invalidatedAt: now }
          : endpoint,
      ),
    },
  };

  await settings.save();
}

/**
 * First column of every row in one block of the categorization prompt — the
 * transaction ids and the category ids the run is allowed to pair up.
 */
function promptRowIds({ prompt, header }: { prompt: string; header: string }): string[] {
  const lines = prompt.split('\n');
  const headerIndex = lines.indexOf(header);
  if (headerIndex === -1) return [];

  const ids: string[] = [];
  // The line right after the header names the columns; rows run until the blank line.
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.trim()) break;
    ids.push(line.split('|')[0]!);
  }

  return ids;
}

/**
 * Endpoint that categorizes for real: it pairs every transaction in the prompt
 * with the first category, which is what makes the run report success and
 * refresh the endpoint's stored status.
 */
function getCategorizingEndpointMock({ baseUrl, onCall }: { baseUrl: string; onCall?: () => void }) {
  return http.post(`${baseUrl}/chat/completions`, async ({ request }) => {
    onCall?.();

    const body = (await request.json()) as { model?: string; messages?: { role: string; content: string }[] };
    const prompt = body.messages?.find((message) => message.role === 'user')?.content ?? '';
    const [categoryId] = promptRowIds({ prompt, header: 'CATEGORIES:' });
    const transactionIds = promptRowIds({ prompt, header: 'TRANSACTIONS:' });
    const content = categoryId ? transactionIds.map((id) => `${id}:${categoryId}`).join('\n') : '';

    return HttpResponse.json({
      id: 'chatcmpl-resolution-test',
      object: 'chat.completion',
      created: 1_700_000_000,
      model: body.model ?? '',
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 42, completion_tokens: 8, total_tokens: 50 },
    });
  });
}

/**
 * Syncs a Monobank account over HTTP and waits for the categorization the sync
 * triggers, so the assertions run against a completed AI attempt.
 */
async function runCategorizationOverHttp({ transactionCount = 2 }: { transactionCount?: number } = {}) {
  const { connectionId } = await helpers.bankDataProviders.connectProvider({
    providerType: BANK_PROVIDER_TYPE.MONOBANK,
    credentials: { apiToken: VALID_MONOBANK_TOKEN },
    providerName: 'Resolution Monobank',
    raw: true,
  });

  const { accounts } = await helpers.bankDataProviders.listExternalAccounts({ connectionId, raw: true });
  const accountExternalIds = accounts.slice(0, 1).map((account) => account.externalId);

  global.mswMockServer.use(
    ...accountExternalIds.map((id) =>
      getMonobankTransactionsMock({
        accountId: id,
        response: helpers.monobank.mockedTransactionData(transactionCount),
      }),
    ),
  );

  await helpers.bankDataProviders.connectSelectedAccounts({
    connectionId,
    accountExternalIds,
    raw: true,
  });

  await helpers.sleep(CATEGORIZATION_RUN_MS);
}

describe('AI custom endpoint resolution', () => {
  let selfHostFlagBeforeTest: string | undefined;
  const serverKeysBeforeTest = new Map<string, string | undefined>();

  beforeEach(() => {
    selfHostFlagBeforeTest = process.env.IS_SELF_HOST;

    // The mock endpoints live on hosts that never resolve, so the outbound guard
    // has to be out of the picture for every case here.
    process.env.IS_SELF_HOST = 'true';

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

  describe('Resolution order', () => {
    it(
      'dials the saved endpoint when the user has no API key and no feature config',
      async () => {
        await createFirstEndpoint();

        let endpointCalls = 0;
        global.mswMockServer.use(
          getCustomEndpointCallCountingMock({
            baseUrl: CUSTOM_ENDPOINT_BASE_URL,
            onCall: () => {
              endpointCalls += 1;
            },
          }),
        );

        await runCategorizationOverHttp();

        expect(endpointCalls).toBeGreaterThan(0);
      },
      CATEGORIZATION_TEST_TIMEOUT_MS,
    );

    it(
      'dials only the endpoint the feature config names, not the first saved one',
      async () => {
        await createFirstEndpoint();
        const second = await createSecondEndpoint();

        await helpers.setAiFeatureConfig({
          feature: AI_FEATURE.categorization,
          modelId: SECOND_CUSTOM_MODEL_ID,
          customEndpointId: second.id,
        });

        let firstEndpointCalls = 0;
        let secondEndpointCalls = 0;
        global.mswMockServer.use(
          getCustomEndpointCallCountingMock({
            baseUrl: CUSTOM_ENDPOINT_BASE_URL,
            onCall: () => {
              firstEndpointCalls += 1;
            },
          }),
          getCustomEndpointCallCountingMock({
            baseUrl: CUSTOM_ENDPOINT_LOOPBACK_BASE_URL,
            onCall: () => {
              secondEndpointCalls += 1;
            },
          }),
        );

        await runCategorizationOverHttp();

        expect(secondEndpointCalls).toBeGreaterThan(0);
        expect(firstEndpointCalls).toBe(0);
      },
      CATEGORIZATION_TEST_TIMEOUT_MS,
    );
  });

  describe('Fallback skips an invalid endpoint', () => {
    it(
      'dials the next endpoint when the first one is flagged invalid',
      async () => {
        const userId = await getTestUserId();
        const first = await createFirstEndpoint();
        await createSecondEndpoint();
        await markStoredEndpointInvalid({ userId, endpointId: first.id });

        let firstEndpointCalls = 0;
        let secondEndpointCalls = 0;
        global.mswMockServer.use(
          getCustomEndpointCallCountingMock({
            baseUrl: CUSTOM_ENDPOINT_BASE_URL,
            onCall: () => {
              firstEndpointCalls += 1;
            },
          }),
          getCustomEndpointCallCountingMock({
            baseUrl: CUSTOM_ENDPOINT_LOOPBACK_BASE_URL,
            onCall: () => {
              secondEndpointCalls += 1;
            },
          }),
        );

        await runCategorizationOverHttp();

        expect(secondEndpointCalls).toBeGreaterThan(0);
        expect(firstEndpointCalls).toBe(0);
      },
      CATEGORIZATION_TEST_TIMEOUT_MS,
    );

    // A user running their own endpoints chose where their transactions may go, so a run
    // must not quietly move to the server's cloud key while their servers are down.
    it(
      'runs nothing at all when every endpoint is flagged invalid, server key or not',
      async () => {
        const userId = await getTestUserId();
        const first = await createFirstEndpoint();
        const second = await createSecondEndpoint();
        await markStoredEndpointInvalid({ userId, endpointId: first.id });
        await markStoredEndpointInvalid({ userId, endpointId: second.id });

        process.env.GEMINI_API_KEY = VALID_GEMINI_API_KEY;

        const geminiCalls = createCallsCounter(global.mswMockServer, GEMINI_API_URL_REGEX);
        let firstEndpointCalls = 0;
        let secondEndpointCalls = 0;
        global.mswMockServer.use(
          createGeminiMock(),
          getCustomEndpointCallCountingMock({
            baseUrl: CUSTOM_ENDPOINT_BASE_URL,
            onCall: () => {
              firstEndpointCalls += 1;
            },
          }),
          getCustomEndpointCallCountingMock({
            baseUrl: CUSTOM_ENDPOINT_LOOPBACK_BASE_URL,
            onCall: () => {
              secondEndpointCalls += 1;
            },
          }),
        );

        await runCategorizationOverHttp();

        expect(firstEndpointCalls).toBe(0);
        expect(secondEndpointCalls).toBe(0);
        expect(geminiCalls.count).toBe(0);
      },
      CATEGORIZATION_TEST_TIMEOUT_MS,
    );
  });

  describe('Status feedback from a real run', () => {
    it(
      'flags the endpoint invalid with an error when it answers 401',
      async () => {
        const userId = await getTestUserId();
        const created = await createFirstEndpoint();
        expect(created.status).toBe('valid');

        global.mswMockServer.use(getCustomEndpointAuthErrorMock({ baseUrl: CUSTOM_ENDPOINT_BASE_URL }));

        await runCategorizationOverHttp();

        const [stored] = await readStoredEndpoints({ userId });
        expect(stored?.status).toBe('invalid');
        // The stored reason names the endpoint rather than API-key credits
        expect(stored?.lastError).toMatch(/endpoint/i);
        expect(stored?.invalidatedAt).toEqual(expect.any(String));
      },
      CATEGORIZATION_TEST_TIMEOUT_MS,
    );

    it(
      'flags the endpoint invalid when a web page answers instead of the API',
      async () => {
        const userId = await getTestUserId();
        const created = await createFirstEndpoint();
        expect(created.status).toBe('valid');

        // The tunnel the endpoint was reached through closed between saving it and this run
        global.mswMockServer.use(...getCustomEndpointWebPageMocks({ baseUrl: CUSTOM_ENDPOINT_BASE_URL }));

        const errorSpy = jest.spyOn(logger, 'error');

        try {
          await runCategorizationOverHttp();

          const [stored] = await readStoredEndpoints({ userId });
          expect(stored?.status).toBe('invalid');
          // The 404 says nothing about the model, so the stored reason must not either
          expect(stored?.lastError).toMatch(/did not respond/i);
          expect(stored?.lastError).not.toContain(CUSTOM_ENDPOINT_MODEL);
          expect(stored?.invalidatedAt).toEqual(expect.any(String));

          // A server the user has to bring back up is their state, not a bug worth reporting
          expect(errorSpy).not.toHaveBeenCalledWith(
            expect.objectContaining({ message: 'AI categorization batch failed' }),
          );
        } finally {
          errorSpy.mockRestore();
        }
      },
      CATEGORIZATION_TEST_TIMEOUT_MS,
    );

    it(
      'moves lastValidatedAt forward when the endpoint answers a batch',
      async () => {
        const userId = await getTestUserId();
        const created = await createFirstEndpoint();

        global.mswMockServer.use(getCategorizingEndpointMock({ baseUrl: CUSTOM_ENDPOINT_BASE_URL }));

        await runCategorizationOverHttp();

        const [stored] = await readStoredEndpoints({ userId });
        expect(stored?.status).toBe('valid');
        expect(stored?.lastError).toBeUndefined();
        expect(new Date(stored!.lastValidatedAt).getTime()).toBeGreaterThan(
          new Date(created.lastValidatedAt).getTime(),
        );
      },
      CATEGORIZATION_TEST_TIMEOUT_MS,
    );
  });

  describe('Endpoint that does not serve the configured model', () => {
    it(
      'stops the run, names the model and leaves the endpoint alone',
      async () => {
        const userId = await getTestUserId();
        const created = await createFirstEndpoint();
        expect(created.status).toBe('valid');

        let endpointCalls = 0;
        global.mswMockServer.use(
          getCustomEndpointModelNotFoundMock({
            baseUrl: CUSTOM_ENDPOINT_BASE_URL,
            onCall: () => {
              endpointCalls += 1;
            },
          }),
        );

        const infoSpy = jest.spyOn(logger, 'info');
        const errorSpy = jest.spyOn(logger, 'error');

        try {
          await runCategorizationOverHttp();

          // One outbound attempt for the whole run: the batch loop stops on the
          // first model-not-found answer instead of repeating the same request.
          expect(endpointCalls).toBe(1);

          // The endpoint is reachable and its key works, so its status must survive
          const [stored] = await readStoredEndpoints({ userId });
          expect(stored?.status).toBe('valid');
          expect(stored?.lastError).toBeUndefined();
          expect(stored?.invalidatedAt).toBeUndefined();

          // The run reports the model to fix, not a generic failure
          const stopLine = infoSpy.mock.calls.find(([message]) => message.startsWith('Stopping AI categorization'));
          expect(stopLine?.[0]).toContain(CUSTOM_ENDPOINT_MODEL);
          expect(stopLine?.[0]).toContain('AI settings');
          expect(stopLine?.[1]).toEqual(expect.objectContaining({ modelId: FIRST_CUSTOM_MODEL_ID }));

          // A wrong model name is the user's configuration, so it must not be logged as a bug
          expect(errorSpy).not.toHaveBeenCalledWith(
            expect.objectContaining({ message: 'AI categorization batch failed' }),
          );
        } finally {
          infoSpy.mockRestore();
          errorSpy.mockRestore();
        }
      },
      CATEGORIZATION_TEST_TIMEOUT_MS,
    );
  });

  describe('Feature configs survive API key removal', () => {
    it('keeps a custom/* config when the last API key is deleted', async () => {
      const userId = await getTestUserId();
      await seedApiKey({ userId, provider: AI_PROVIDER.openai });
      const endpoint = await createFirstEndpoint();

      await helpers.setAiFeatureConfig({
        feature: AI_FEATURE.categorization,
        modelId: FIRST_CUSTOM_MODEL_ID,
        customEndpointId: endpoint.id,
      });

      const deleteResponse = await helpers.deleteAiApiKey({ provider: AI_PROVIDER.openai });
      expect(deleteResponse.statusCode).toBe(200);

      const keyStatus = await helpers.getAiApiKeyStatus({ raw: true });
      expect(keyStatus.hasApiKey).toBe(false);

      expect(await readStoredFeatureConfigs({ userId })).toEqual([
        {
          feature: AI_FEATURE.categorization,
          modelId: FIRST_CUSTOM_MODEL_ID,
          customEndpointId: endpoint.id,
        },
      ]);

      const config = await helpers.getAiFeatureConfig({ feature: AI_FEATURE.categorization, raw: true });
      expect(config.modelId).toBe(FIRST_CUSTOM_MODEL_ID);
      expect(config.endpointName).toBe(FIRST_ENDPOINT_NAME);
    });
  });

  describe('Feature status matches what the run dials', () => {
    it('reports the fallback endpoint for a feature with no config of its own', async () => {
      const endpoint = await createFirstEndpoint();

      const { features } = await helpers.getAiFeaturesStatus({ raw: true });
      const categorization = features.find((feature) => feature.feature === AI_FEATURE.categorization);

      expect(categorization?.isConfigured).toBe(false);
      // Every field names the endpoint, so the screen cannot show one model and label it with another
      expect(categorization?.modelId).toBe(FIRST_CUSTOM_MODEL_ID);
      expect(categorization?.modelName).toBe(CUSTOM_ENDPOINT_MODEL);
      expect(categorization?.customEndpointId).toBe(endpoint.id);
      expect(categorization?.endpointName).toBe(FIRST_ENDPOINT_NAME);
      expect(categorization?.usingUserKey).toBe(true);
    });

    it('reports the fallback endpoint for a config whose provider has no key anywhere', async () => {
      const userId = await getTestUserId();
      const endpoint = await createFirstEndpoint();

      // The model picker offers catalog models only for providers the user has a
      // key for, but the route itself accepts the pick without one.
      const saved = await helpers.setAiFeatureConfig({
        feature: AI_FEATURE.categorization,
        modelId: KEYLESS_CATALOG_MODEL_ID,
        raw: true,
      });

      // Neither key exists, so the run lands on the endpoint and the response says so
      expect(saved.isConfigured).toBe(true);
      expect(saved.modelId).toBe(FIRST_CUSTOM_MODEL_ID);
      expect(saved.modelName).toBe(CUSTOM_ENDPOINT_MODEL);
      expect(saved.customEndpointId).toBe(endpoint.id);
      expect(saved.usingUserKey).toBe(true);

      const config = await helpers.getAiFeatureConfig({ feature: AI_FEATURE.categorization, raw: true });
      expect(config.modelId).toBe(FIRST_CUSTOM_MODEL_ID);
      expect(config.modelName).toBe(CUSTOM_ENDPOINT_MODEL);
      expect(config.customEndpointId).toBe(endpoint.id);
      expect(config.endpointName).toBe(FIRST_ENDPOINT_NAME);
      expect(config.usingUserKey).toBe(true);

      // Only the display follows the run — the pick itself is untouched
      expect(await readStoredFeatureConfigs({ userId })).toEqual([
        { feature: AI_FEATURE.categorization, modelId: KEYLESS_CATALOG_MODEL_ID },
      ]);
    });

    it('reports the configured catalog model once the server holds its key', async () => {
      await createFirstEndpoint();
      process.env.ANTHROPIC_API_KEY = 'server-side-anthropic-key';

      await helpers.setAiFeatureConfig({ feature: AI_FEATURE.categorization, modelId: KEYLESS_CATALOG_MODEL_ID });

      const config = await helpers.getAiFeatureConfig({ feature: AI_FEATURE.categorization, raw: true });

      // The server key answers before the endpoint is ever considered
      expect(config.modelId).toBe(KEYLESS_CATALOG_MODEL_ID);
      expect(config.customEndpointId).toBeUndefined();
      expect(config.endpointName).toBeUndefined();
      expect(config.usingUserKey).toBe(false);
      expect(config.modelName).not.toBe(CUSTOM_ENDPOINT_MODEL);
    });

    // The run refuses to serve the feature from the server key while the user owns
    // endpoints, so naming a catalog model here would promise something nothing runs.
    it('keeps naming the endpoint when it is flagged invalid', async () => {
      const userId = await getTestUserId();
      const first = await createFirstEndpoint();
      process.env.ANTHROPIC_API_KEY = 'server-side-anthropic-key';
      await markStoredEndpointInvalid({ userId, endpointId: first.id });

      const { features } = await helpers.getAiFeaturesStatus({ raw: true });
      const categorization = features.find((feature) => feature.feature === AI_FEATURE.categorization);

      expect(isCustomModelId({ modelId: categorization!.modelId })).toBe(true);
      expect(categorization?.customEndpointId).toBe(first.id);
      expect(categorization?.endpointName).toBe(FIRST_ENDPOINT_NAME);
      expect(categorization?.modelName).toBe(CUSTOM_ENDPOINT_MODEL);
      // The server key exists but must not be what pays here — the endpoint is the answer
      expect(categorization?.usingUserKey).toBe(true);
    });
  });
});
