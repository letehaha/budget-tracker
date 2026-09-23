import { AI_FEATURE, PLANS, type RecordId } from '@bt/shared/types';
import { describe, expect, it, jest } from '@jest/globals';
import { logger } from '@js/utils/logger';
import { CONNECTION_KEY_UNREADABLE_ERROR_MESSAGE } from '@services/ai/connection-failure';
import * as helpers from '@tests/helpers';
import { runAsCloud, useSelfHostWithoutServerAiKeys } from '@tests/helpers/ai-test-env';
import { createOpenAiConnection, patchStoredConnection } from '@tests/helpers/user-settings';
import { VALID_GEMINI_API_KEY, createGeminiMock } from '@tests/mocks/gemini/mock-api';
import { createCallsCounter } from '@tests/mocks/helpers';
import {
  CUSTOM_ENDPOINT_BASE_URL,
  CUSTOM_ENDPOINT_LOOPBACK_BASE_URL,
  CUSTOM_ENDPOINT_MODEL,
  getCustomEndpointAuthErrorMock,
  getCustomEndpointModelNotFoundMock,
  getCustomEndpointOfflineMock,
  getCustomEndpointWebPageMocks,
} from '@tests/mocks/openai-compatible/mock-api';
import {
  OPENAI_RESPONSES_URL,
  createOpenAiAuthErrorMock,
  createOpenAiModelNotFoundMock,
} from '@tests/mocks/openai/mock-api';
import { HttpResponse, http } from 'msw';

const FEATURE = AI_FEATURE.categorization;

const FIRST_CHAT_URL = `${CUSTOM_ENDPOINT_BASE_URL}/chat/completions`;
const SECOND_CHAT_URL = `${CUSTOM_ENDPOINT_LOOPBACK_BASE_URL}/chat/completions`;
const GEMINI_API_URL_REGEX = /generativelanguage\.googleapis\.com/;

const RUN_SETTLE_TIMEOUT_MS = 20_000;
const RUN_TEST_TIMEOUT_MS = 40_000;

const countCalls = ({ url }: { url: string | RegExp }) => createCallsCounter(global.mswMockServer, url);

/** Takes the connection's server offline and re-tests it, which flags it invalid. */
const flagInvalid = ({ connectionId, baseUrl }: { connectionId: string; baseUrl: string }) => {
  global.mswMockServer.use(getCustomEndpointOfflineMock({ baseUrl }));
  return helpers.testAiConnection({ connectionId, raw: true });
};

async function findConnection({ id }: { id: string }) {
  const connections = await helpers.getAiConnections({ raw: true });
  return connections.find((connection) => connection.id === id);
}

/** First column of every row in one block of the categorization prompt. */
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

/** Pairs every transaction with the first category, so the run succeeds and refreshes the connection's status. */
function getCategorizingEndpointMock({ baseUrl }: { baseUrl: string }) {
  return http.post(`${baseUrl}/chat/completions`, async ({ request }) => {
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
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 42, completion_tokens: 8, total_tokens: 50 },
    });
  });
}

/** Triggers categorization over two fresh transactions and returns once the run has finished. */
async function runCategorization(): Promise<void> {
  const user = await helpers.getUserInfo({ raw: true });
  const account = await helpers.createAccount({ raw: true });
  for (const amount of [100, 101]) {
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        categoryId: user.defaultCategoryId as RecordId,
        amount,
      }),
      raw: true,
    });
  }

  const response = await helpers.triggerAiCategorization();
  expect(response.statusCode).toBe(200);

  await helpers.waitForCategorizationStatus({
    predicate: ({ status }) => status === 'idle' || status === 'failed',
    timeoutMs: RUN_SETTLE_TIMEOUT_MS,
  });
}

describe('AI connection resolution', () => {
  useSelfHostWithoutServerAiKeys();

  describe('Feature pick', () => {
    it(
      'dials a picked connection even while it is flagged invalid, and clears the flag once it answers',
      async () => {
        const first = await helpers.createFirstConnection();
        const second = await helpers.createSecondConnection();
        await helpers.setAiFeatureConfig({ feature: FEATURE, connectionId: second.id, raw: true });
        await flagInvalid({ connectionId: second.id, baseUrl: CUSTOM_ENDPOINT_LOOPBACK_BASE_URL });

        global.mswMockServer.use(getCategorizingEndpointMock({ baseUrl: CUSTOM_ENDPOINT_LOOPBACK_BASE_URL }));
        const firstCalls = countCalls({ url: FIRST_CHAT_URL });
        const secondCalls = countCalls({ url: SECOND_CHAT_URL });

        await runCategorization();

        expect(secondCalls.count).toBeGreaterThan(0);
        expect(firstCalls.count).toBe(0);

        const healed = await findConnection({ id: second.id });
        expect(healed).toMatchObject({ status: 'valid' });
        expect(healed?.lastError).toBeUndefined();
        expect(healed?.invalidatedAt).toBeUndefined();
        expect(new Date(healed!.lastValidatedAt).getTime()).toBeGreaterThan(new Date(second.lastValidatedAt).getTime());
        expect((await findConnection({ id: first.id }))?.status).toBe('valid');
      },
      RUN_TEST_TIMEOUT_MS,
    );

    it(
      'answers a server pick from the server model instead of the default connection',
      async () => {
        process.env.GEMINI_API_KEY = VALID_GEMINI_API_KEY;
        await helpers.createFirstConnection();
        await helpers.setAiFeatureConfig({ feature: FEATURE, connectionId: null, raw: true });

        global.mswMockServer.use(createGeminiMock());
        const geminiCalls = countCalls({ url: GEMINI_API_URL_REGEX });
        const connectionCalls = countCalls({ url: FIRST_CHAT_URL });

        await runCategorization();

        expect(geminiCalls.count).toBeGreaterThan(0);
        expect(connectionCalls.count).toBe(0);
      },
      RUN_TEST_TIMEOUT_MS,
    );

    it(
      'falls through to the default connection once the user loses the server model they picked',
      async () => {
        // Cloud mode: the seeded user holds Plus until the plan below takes operator_ai away.
        runAsCloud();
        process.env.GEMINI_API_KEY = VALID_GEMINI_API_KEY;
        const openAi = await createOpenAiConnection();
        await helpers.setAiFeatureConfig({ feature: FEATURE, connectionId: null, raw: true });

        await helpers.setUserBilling({ plan: PLANS.essential });

        const status = await helpers.getAiFeatureConfig({ feature: FEATURE, raw: true });
        expect(status).toMatchObject({
          isConfigured: false,
          servedBy: 'connection',
          connectionId: openAi.id,
          serverModelName: null,
        });

        global.mswMockServer.use(createGeminiMock());
        const geminiCalls = countCalls({ url: GEMINI_API_URL_REGEX });
        const openAiCalls = countCalls({ url: OPENAI_RESPONSES_URL });

        await runCategorization();

        expect(openAiCalls.count).toBeGreaterThan(0);
        expect(geminiCalls.count).toBe(0);
      },
      RUN_TEST_TIMEOUT_MS,
    );
  });

  describe('Default connection', () => {
    it(
      'skips a flagged first connection and dials the next one',
      async () => {
        const first = await helpers.createFirstConnection();
        await helpers.createSecondConnection();
        await flagInvalid({ connectionId: first.id, baseUrl: CUSTOM_ENDPOINT_BASE_URL });

        const firstCalls = countCalls({ url: FIRST_CHAT_URL });
        const secondCalls = countCalls({ url: SECOND_CHAT_URL });

        await runCategorization();

        expect(secondCalls.count).toBeGreaterThan(0);
        expect(firstCalls.count).toBe(0);
      },
      RUN_TEST_TIMEOUT_MS,
    );

    it(
      'dials the connection moved to the front by set-default',
      async () => {
        await helpers.createFirstConnection();
        const second = await helpers.createSecondConnection();

        const reordered = await helpers.setDefaultAiConnection({ id: second.id, raw: true });
        expect(reordered[0]?.id).toBe(second.id);

        const firstCalls = countCalls({ url: FIRST_CHAT_URL });
        const secondCalls = countCalls({ url: SECOND_CHAT_URL });

        await runCategorization();

        expect(secondCalls.count).toBeGreaterThan(0);
        expect(firstCalls.count).toBe(0);
      },
      RUN_TEST_TIMEOUT_MS,
    );

    // The user chose where their transactions may go, so a run must not quietly move to the
    // server model while their own connections are down.
    it('refuses to run when every connection is flagged invalid, server key or not', async () => {
      process.env.GEMINI_API_KEY = VALID_GEMINI_API_KEY;
      const first = await helpers.createFirstConnection();
      const second = await helpers.createSecondConnection();
      const firstFlag = await flagInvalid({ connectionId: first.id, baseUrl: CUSTOM_ENDPOINT_BASE_URL });
      await flagInvalid({ connectionId: second.id, baseUrl: CUSTOM_ENDPOINT_LOOPBACK_BASE_URL });

      const response = await helpers.triggerAiCategorization();

      expect(response.statusCode).toBe(422);
      expect(helpers.errorMessage({ response })).toBe(firstFlag.error);

      const status = await helpers.getAiFeatureConfig({ feature: FEATURE, raw: true });
      expect(status).toMatchObject({ servedBy: null, connectionId: first.id });
    });

    it(
      'answers from the server model when the user has no connections',
      async () => {
        process.env.GEMINI_API_KEY = VALID_GEMINI_API_KEY;

        global.mswMockServer.use(createGeminiMock());
        const geminiCalls = countCalls({ url: GEMINI_API_URL_REGEX });

        await runCategorization();

        expect(geminiCalls.count).toBeGreaterThan(0);
      },
      RUN_TEST_TIMEOUT_MS,
    );
  });

  describe('Native connection without a key', () => {
    it(
      'skips it, flags it and dials the next connection',
      async () => {
        const openAi = await createOpenAiConnection();
        await helpers.createFirstConnection();
        await patchStoredConnection({ connectionId: openAi.id, patch: { keyEncrypted: undefined } });

        const openAiCalls = countCalls({ url: OPENAI_RESPONSES_URL });
        const customCalls = countCalls({ url: FIRST_CHAT_URL });

        await runCategorization();

        expect(customCalls.count).toBeGreaterThan(0);
        expect(openAiCalls.count).toBe(0);
        expect(await findConnection({ id: openAi.id })).toMatchObject({
          hasApiKey: false,
          status: 'invalid',
          lastError: CONNECTION_KEY_UNREADABLE_ERROR_MESSAGE,
        });
      },
      RUN_TEST_TIMEOUT_MS,
    );

    it(
      'skips a restored keyless connection even when a feature picks it, keeping its message',
      async () => {
        const restoredError = 'API key left out of the backup';
        const openAi = await createOpenAiConnection();
        await helpers.createFirstConnection();
        await helpers.setAiFeatureConfig({ feature: FEATURE, connectionId: openAi.id, raw: true });
        await patchStoredConnection({
          connectionId: openAi.id,
          patch: {
            keyEncrypted: undefined,
            status: 'invalid',
            lastError: restoredError,
            invalidatedAt: new Date().toISOString(),
          },
        });

        const openAiCalls = countCalls({ url: OPENAI_RESPONSES_URL });
        const customCalls = countCalls({ url: FIRST_CHAT_URL });

        await runCategorization();

        expect(customCalls.count).toBeGreaterThan(0);
        expect(openAiCalls.count).toBe(0);
        expect((await findConnection({ id: openAi.id }))?.lastError).toBe(restoredError);
      },
      RUN_TEST_TIMEOUT_MS,
    );
  });

  describe('Status feedback from a real run', () => {
    it(
      'flags the connection invalid when it answers 401',
      async () => {
        const created = await helpers.createFirstConnection();

        global.mswMockServer.use(getCustomEndpointAuthErrorMock({ baseUrl: CUSTOM_ENDPOINT_BASE_URL }));

        await runCategorization();

        const stored = await findConnection({ id: created.id });
        expect(stored?.status).toBe('invalid');
        expect(stored?.lastError).toMatch(/endpoint/i);
        expect(stored?.invalidatedAt).toEqual(expect.any(String));
      },
      RUN_TEST_TIMEOUT_MS,
    );

    // Falling back to the server model would send the transactions to a provider the user never picked.
    it(
      'flags a native connection with the key copy when its key is rejected, without moving to the server model',
      async () => {
        process.env.GEMINI_API_KEY = VALID_GEMINI_API_KEY;
        const openAi = await createOpenAiConnection();

        global.mswMockServer.use(createOpenAiAuthErrorMock(), createGeminiMock());
        const geminiCalls = countCalls({ url: GEMINI_API_URL_REGEX });

        await runCategorization();

        const stored = await findConnection({ id: openAi.id });
        expect(stored?.status).toBe('invalid');
        expect(stored?.lastError).toMatch(/API key/);
        expect(stored?.lastError).not.toMatch(/endpoint/i);
        expect(geminiCalls.count).toBe(0);
      },
      RUN_TEST_TIMEOUT_MS,
    );

    it(
      'flags the connection invalid when a web page answers instead of the API',
      async () => {
        const created = await helpers.createFirstConnection();

        global.mswMockServer.use(...getCustomEndpointWebPageMocks({ baseUrl: CUSTOM_ENDPOINT_BASE_URL }));
        const errorSpy = jest.spyOn(logger, 'error');

        try {
          await runCategorization();

          const stored = await findConnection({ id: created.id });
          expect(stored?.status).toBe('invalid');
          expect(stored?.lastError).toMatch(/did not respond/i);
          expect(stored?.lastError).not.toContain(CUSTOM_ENDPOINT_MODEL);
          expect(stored?.invalidatedAt).toEqual(expect.any(String));

          // A server the user has to bring back up is their state, so it stays out of the error log
          expect(errorSpy).not.toHaveBeenCalledWith(
            expect.objectContaining({ message: 'AI categorization batch failed' }),
          );
        } finally {
          errorSpy.mockRestore();
        }
      },
      RUN_TEST_TIMEOUT_MS,
    );

    it(
      'stops on a model the connection does not serve, names it and flags the connection',
      async () => {
        const created = await helpers.createFirstConnection();

        global.mswMockServer.use(getCustomEndpointModelNotFoundMock({ baseUrl: CUSTOM_ENDPOINT_BASE_URL }));
        const connectionCalls = countCalls({ url: FIRST_CHAT_URL });
        const infoSpy = jest.spyOn(logger, 'info');
        const errorSpy = jest.spyOn(logger, 'error');

        try {
          await runCategorization();

          // The batch loop stops on the first model-not-found answer instead of repeating the request
          expect(connectionCalls.count).toBe(1);

          const stored = await findConnection({ id: created.id });
          expect(stored?.status).toBe('invalid');
          expect(stored?.lastError).toContain(CUSTOM_ENDPOINT_MODEL);
          expect(stored?.invalidatedAt).toEqual(expect.any(String));

          const stopLine = infoSpy.mock.calls.find(([message]) => message.startsWith('Stopping AI categorization'));
          expect(stopLine?.[0]).toContain(CUSTOM_ENDPOINT_MODEL);
          expect(stopLine?.[1]).toEqual(expect.objectContaining({ modelId: `custom/${CUSTOM_ENDPOINT_MODEL}` }));

          expect(errorSpy).not.toHaveBeenCalledWith(
            expect.objectContaining({ message: 'AI categorization batch failed' }),
          );
        } finally {
          infoSpy.mockRestore();
          errorSpy.mockRestore();
        }
      },
      RUN_TEST_TIMEOUT_MS,
    );

    it(
      'flags a native connection whose model the provider no longer serves',
      async () => {
        const openAi = await createOpenAiConnection();

        global.mswMockServer.use(createOpenAiModelNotFoundMock());

        await runCategorization();

        const stored = await findConnection({ id: openAi.id });
        expect(stored?.status).toBe('invalid');
        expect(stored?.lastError).toContain(openAi.model);
      },
      RUN_TEST_TIMEOUT_MS,
    );
  });
});
