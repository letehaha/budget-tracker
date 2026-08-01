import { BANK_PROVIDER_TYPE, SSE_EVENT_TYPES } from '@bt/shared/types';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { app } from '@root/app';
import { API_PREFIX } from '@root/config';
import { sseManager } from '@services/common/sse';
import * as helpers from '@tests/helpers';
import { GEMINI_API_URL, VALID_GEMINI_API_KEY } from '@tests/mocks/gemini/mock-api';
import { VALID_MONOBANK_TOKEN, getMonobankTransactionsMock } from '@tests/mocks/monobank/mock-api';
import { HttpResponse, delay, http } from 'msw';
import request from 'supertest';

/**
 * Gemini mock that holds the response for `delayMs` before answering with no
 * categorizations. The hold keeps the BullMQ job in `active` state long enough
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

    it('returns 401 for unauthenticated request', async () => {
      const response = await request(app).get(`${API_PREFIX}/user/ai/categorization/status`);

      expect(response.statusCode).toBe(401);
    });

    it('reports processing while a job runs and returns to idle afterwards', async () => {
      const MOCK_TRANSACTION_COUNT = 3;

      process.env.GEMINI_API_KEY = VALID_GEMINI_API_KEY;

      const sseSpy = jest.spyOn(sseManager, 'sendToUser');

      // Bank sync is the trigger: it emits TRANSACTIONS_SYNCED, which (after a
      // debounce) enqueues the categorization job for the synced transactions.
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
        // Long enough for the poll below to observe the job mid-batch
        delayedGeminiMock({ delayMs: 5000 }),
      );

      await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId,
        accountExternalIds: accountIds,
        raw: true,
      });

      // While the Gemini mock holds the response, the endpoint must report the
      // run as processing — this is what a reloaded page rehydrates from.
      // Timeouts are explicit so both waits fit the 30s test budget and a slow
      // run fails with the helper's "Last status" message, not a Jest timeout.
      const processing = await helpers.waitForCategorizationStatus({
        predicate: (status) => status.status === 'processing',
        timeoutMs: 12000,
      });
      expect(processing).toMatchObject({ totalCount: MOCK_TRANSACTION_COUNT, processedCount: 0 });

      // Another user must never see this run — the pointer and the job are
      // scoped to the user that owns the synced transactions.
      const secondUser = await helpers.signUpSecondUser();
      const otherUserStatus = await helpers.asUser({
        cookies: secondUser.cookies,
        fn: () => helpers.getAiCategorizationStatus({ raw: true }),
      });
      expect(otherUserStatus.status).toBe('idle');

      // Once the job finishes it is removed from the queue (removeOnComplete),
      // so the endpoint settles back to idle.
      await helpers.waitForCategorizationStatus({
        predicate: (status) => status.status === 'idle',
        timeoutMs: 12000,
      });

      // The batch-start SSE event must go out BEFORE the model answers — a
      // single batch can take minutes, and without this the UI sits on
      // "queued" the whole time.
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
  });
});
