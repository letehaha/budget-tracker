import { BANK_PROVIDER_TYPE, SSE_EVENT_TYPES } from '@bt/shared/types';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { sseManager } from '@services/common/sse';
import * as helpers from '@tests/helpers';
import {
  GEMINI_API_URL,
  INVALID_GEMINI_API_KEY,
  VALID_GEMINI_API_KEY,
  createGeminiMock,
} from '@tests/mocks/gemini/mock-api';
import { VALID_MONOBANK_TOKEN, getMonobankTransactionsMock } from '@tests/mocks/monobank/mock-api';
import { HttpResponse, delay, http } from 'msw';

/**
 * Holds the response for `delayMs`, keeping the BullMQ job `active` long enough
 * for the status endpoint to be observed mid-run.
 */
function delayedGeminiMock({ delayMs }: { delayMs: number }) {
  return http.post(GEMINI_API_URL, async () => {
    await delay(delayMs);
    return HttpResponse.json({
      candidates: [
        {
          content: { parts: [{ text: '# No categorizations' }], role: 'model' },
          finishReason: 'STOP',
          index: 0,
        },
      ],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 },
    });
  });
}

describe('AI Categorization Status', () => {
  let originalGeminiApiKey: string | undefined;

  beforeEach(() => {
    originalGeminiApiKey = process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    // Un-spy sseManager even when an assertion mid-test failed
    jest.restoreAllMocks();

    if (originalGeminiApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalGeminiApiKey;
    }
  });

  describe('GET /user/ai/categorization/status', () => {
    it('returns idle when no categorization has ever run', async () => {
      const status = await helpers.getAiCategorizationStatus({ raw: true });

      expect(status).toEqual({ status: 'idle' });
    });

    it('reports processing while a job runs and returns to idle afterwards', async () => {
      const MOCK_TRANSACTION_COUNT = 3;

      process.env.GEMINI_API_KEY = VALID_GEMINI_API_KEY;

      const sseSpy = jest.spyOn(sseManager, 'sendToUser');

      const { connectionId } = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        providerName: 'Test Monobank',
        raw: true,
      });

      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId,
        raw: true,
      });
      const accountIds = externalAccounts.slice(0, 1).map((acc: { externalId: string }) => acc.externalId);

      global.mswMockServer.use(
        ...accountIds.map((id) =>
          getMonobankTransactionsMock({
            accountId: id,
            response: helpers.monobank.mockedTransactionData(MOCK_TRANSACTION_COUNT),
          }),
        ),
        delayedGeminiMock({ delayMs: 5000 }),
      );

      await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId,
        accountExternalIds: accountIds,
        raw: true,
      });

      // Explicit timeouts so both waits fit the 30s budget and a slow run fails with
      // the helper's "Last status" message instead of a bare Jest timeout.
      const processing = await helpers.waitForCategorizationStatus({
        predicate: (status) => status.status === 'processing',
        timeoutMs: 12000,
      });
      expect(processing).toMatchObject({ totalCount: MOCK_TRANSACTION_COUNT, processedCount: 0 });

      // The pointer and the job are scoped to the user who owns the synced transactions.
      const secondUser = await helpers.signUpSecondUser();
      const otherUserStatus = await helpers.asUser({
        cookies: secondUser.cookies,
        fn: () => helpers.getAiCategorizationStatus({ raw: true }),
      });
      expect(otherUserStatus.status).toBe('idle');

      // `removeOnComplete` deletes the finished job, so the endpoint settles back to idle.
      await helpers.waitForCategorizationStatus({
        predicate: (status) => status.status === 'idle',
        timeoutMs: 12000,
      });

      // The batch-start SSE event must go out before the model answers, or the UI
      // sits on "queued" for the whole batch.
      const progressEvents = sseSpy.mock.calls
        .map(([args]) => args)
        .filter((args) => args.event === SSE_EVENT_TYPES.AI_CATEGORIZATION_PROGRESS);
      expect(progressEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              status: 'processing',
              processedCount: 0,
              totalCount: MOCK_TRANSACTION_COUNT,
            }),
          }),
        ]),
      );
    }, 30_000);

    it('serves the terminal outcome of a stopped run exactly once, then settles to idle', async () => {
      const MOCK_TRANSACTION_COUNT = 3;

      // A rejected server key stops the run on its first batch. The job completes and
      // is deleted at once, so only the terminal-outcome record can explain it.
      process.env.GEMINI_API_KEY = INVALID_GEMINI_API_KEY;
      global.mswMockServer.use(createGeminiMock({}));

      const { connectionId } = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        providerName: 'Test Monobank Terminal Outcome',
        raw: true,
      });

      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId,
        raw: true,
      });
      const accountIds = externalAccounts.slice(0, 1).map((acc: { externalId: string }) => acc.externalId);

      global.mswMockServer.use(
        ...accountIds.map((id) =>
          getMonobankTransactionsMock({
            accountId: id,
            response: helpers.monobank.mockedTransactionData(MOCK_TRANSACTION_COUNT),
          }),
        ),
      );

      await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId,
        accountExternalIds: accountIds,
        raw: true,
      });

      const terminal = await helpers.waitForCategorizationStatus({
        predicate: (status) => status.status === 'completed',
        timeoutMs: 15000,
      });
      expect(terminal).toMatchObject({
        status: 'completed',
        totalCount: MOCK_TRANSACTION_COUNT,
        failedCount: MOCK_TRANSACTION_COUNT,
        // Curated copy, never the provider's raw 401 body
        errorMessage: expect.stringMatching(/API key is not working/i),
      });

      const afterConsume = await helpers.getAiCategorizationStatus({ raw: true });
      expect(afterConsume).toEqual({ status: 'idle' });
    }, 30_000);
  });
});
