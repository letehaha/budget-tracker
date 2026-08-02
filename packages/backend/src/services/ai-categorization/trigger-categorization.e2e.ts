import {
  AI_CATEGORIZATION_MAX_TRANSACTIONS_PER_RUN,
  AI_PROVIDER,
  CATEGORIZATION_SOURCE,
  type RecordId,
  TRANSACTION_TRANSFER_NATURE,
} from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import Transactions from '@models/transactions.model';
import { app } from '@root/app';
import { API_PREFIX } from '@root/config';
import * as helpers from '@tests/helpers';
import { useSelfHostWithoutServerAiKeys } from '@tests/helpers/ai-test-env';
import { GEMINI_API_URL, VALID_GEMINI_API_KEY, createGeminiMock } from '@tests/mocks/gemini/mock-api';
import { HttpResponse, delay, http } from 'msw';
import request from 'supertest';

const TRIGGER_URL = `${API_PREFIX}/user/ai/categorization/trigger`;

const RUN_SETTLE_TIMEOUT_MS = 15_000;
const TEST_TIMEOUT_MS = 60_000;

/**
 * Answers any Gemini model, unlike `createGeminiMock`, so a case can save a user API key
 * (validated against a different model) and run categorization behind the same handler.
 * The default text categorizes nothing, leaving the transactions eligible for a re-trigger.
 */
function geminiTextMock({ text = '# No categorizations', delayMs = 0 }: { text?: string; delayMs?: number } = {}) {
  return http.post(GEMINI_API_URL, async () => {
    if (delayMs) await delay(delayMs);

    return HttpResponse.json({
      candidates: [{ content: { parts: [{ text }], role: 'model' }, finishReason: 'STOP', index: 0 }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
    });
  });
}

async function seedUncategorizedTransactions({ count }: { count: number }): Promise<RecordId[]> {
  const user = await helpers.getUserInfo({ raw: true });
  const account = await helpers.createAccount({ raw: true });
  const transactionIds: RecordId[] = [];

  for (let index = 0; index < count; index++) {
    const [transaction] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        categoryId: user.defaultCategoryId as RecordId,
        amount: 100 + index,
        note: `Coffee shop ${index}`,
      }),
      raw: true,
    });

    transactionIds.push(transaction.id);
  }

  return transactionIds;
}

async function seedTransferTransaction(): Promise<RecordId> {
  const user = await helpers.getUserInfo({ raw: true });
  const source = await helpers.createAccount({ raw: true });
  const destination = await helpers.createAccount({ raw: true });

  const [transaction] = await helpers.createTransaction({
    payload: {
      ...helpers.buildTransactionPayload({
        accountId: source.id,
        categoryId: user.defaultCategoryId as RecordId,
        amount: 500,
      }),
      transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
      destinationAmount: 500,
      destinationAccountId: destination.id,
    },
    raw: true,
  });

  return transaction.id;
}

async function seedManuallyCategorizedTransaction(): Promise<RecordId> {
  const [transactionId] = await seedUncategorizedTransactions({ count: 1 });
  const category = await helpers.addCustomCategory({ name: `Groceries ${Date.now()}`, color: '#123456', raw: true });

  await helpers.updateTransaction({
    id: transactionId!,
    payload: { categoryId: category.id },
    raw: true,
  });

  return transactionId!;
}

const waitForRunToSettle = () =>
  helpers.waitForCategorizationStatus({
    predicate: (status) => status.status === 'idle',
    timeoutMs: RUN_SETTLE_TIMEOUT_MS,
  });

const errorDetails = ({ response }: { response: { body: unknown } }) =>
  (response.body as { response?: { details?: Record<string, unknown> } }).response?.details;

describe('POST /user/ai/categorization/trigger', () => {
  let originalGeminiApiKey: string | undefined;

  beforeEach(() => {
    originalGeminiApiKey = process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    if (originalGeminiApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalGeminiApiKey;
    }
  });

  it('returns 401 for an unauthenticated request', async () => {
    const response = await request(app).post(TRIGGER_URL);

    expect(response.statusCode).toBe(401);
  });

  it(
    'categorizes the transactions still sitting in the default category',
    async () => {
      process.env.GEMINI_API_KEY = VALID_GEMINI_API_KEY;
      global.mswMockServer.use(createGeminiMock({ categorizations: { 1: 1, 2: 1 } }));

      await seedUncategorizedTransactions({ count: 2 });

      const response = await helpers.triggerAiCategorization();
      expect(response.statusCode).toBe(200);
      expect(response.body.response).toEqual({ enqueued: true, totalCount: 2 });

      await waitForRunToSettle();

      const transactions = await Transactions.findAll({ attributes: ['id', 'categorizationMeta'] });
      expect(transactions).toHaveLength(2);
      for (const transaction of transactions) {
        expect(transaction.categorizationMeta?.source).toBe(CATEGORIZATION_SOURCE.ai);
      }
    },
    TEST_TIMEOUT_MS,
  );

  it('reports nothing to do and spends no budget when there are no candidates', async () => {
    process.env.GEMINI_API_KEY = VALID_GEMINI_API_KEY;
    global.mswMockServer.use(geminiTextMock());

    // Past the server-key budget of 3, so a consumed attempt would surface as a 429.
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await helpers.triggerAiCategorization();

      expect(response.statusCode).toBe(200);
      expect(response.body.response).toEqual({ enqueued: false, totalCount: 0 });
    }
  });

  it(
    'returns 409 while a run is already going',
    async () => {
      process.env.GEMINI_API_KEY = VALID_GEMINI_API_KEY;
      global.mswMockServer.use(geminiTextMock({ delayMs: 3000 }));

      await seedUncategorizedTransactions({ count: 2 });

      const first = await helpers.triggerAiCategorization();
      expect(first.statusCode).toBe(200);

      const second = await helpers.triggerAiCategorization();
      expect(second.statusCode).toBe(409);

      await waitForRunToSettle();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'enqueues one run and rejects the other when two triggers arrive at once',
    async () => {
      process.env.GEMINI_API_KEY = VALID_GEMINI_API_KEY;
      global.mswMockServer.use(geminiTextMock({ delayMs: 3000 }));

      await seedUncategorizedTransactions({ count: 2 });

      const responses = await Promise.all([helpers.triggerAiCategorization(), helpers.triggerAiCategorization()]);

      const enqueued = responses.filter((response) => response.statusCode === 200);
      const rejected = responses.filter((response) => response.statusCode === 409);

      expect(rejected).toHaveLength(1);
      expect(enqueued).toHaveLength(1);
      expect(enqueued[0]!.body.response).toEqual({ enqueued: true, totalCount: 2 });

      await waitForRunToSettle();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'returns 429 on the fourth trigger within the window for a server-key user',
    async () => {
      process.env.GEMINI_API_KEY = VALID_GEMINI_API_KEY;
      global.mswMockServer.use(geminiTextMock());

      await seedUncategorizedTransactions({ count: 2 });

      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await helpers.triggerAiCategorization();

        expect(response.statusCode).toBe(200);
        expect(response.body.response).toEqual({ enqueued: true, totalCount: 2 });

        await waitForRunToSettle();
      }

      const denied = await helpers.triggerAiCategorization();
      expect(denied.statusCode).toBe(429);
      expect(errorDetails({ response: denied })).toEqual(expect.objectContaining({ retryAfter: expect.any(Number) }));
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'never rate-limits a user running on their own credentials',
    async () => {
      delete process.env.GEMINI_API_KEY;
      global.mswMockServer.use(geminiTextMock());

      const keyResponse = await helpers.setAiApiKey({
        apiKey: VALID_GEMINI_API_KEY,
        provider: AI_PROVIDER.google,
      });
      expect(keyResponse.statusCode).toBe(200);

      await seedUncategorizedTransactions({ count: 2 });

      for (let attempt = 0; attempt < 5; attempt++) {
        const response = await helpers.triggerAiCategorization();

        expect(response.statusCode).toBe(200);
        expect(response.body.response).toEqual({ enqueued: true, totalCount: 2 });

        await waitForRunToSettle();
      }
    },
    TEST_TIMEOUT_MS,
  );

  describe('with a subset of transaction ids', () => {
    it(
      'categorizes only the requested transactions',
      async () => {
        process.env.GEMINI_API_KEY = VALID_GEMINI_API_KEY;
        global.mswMockServer.use(createGeminiMock({ categorizations: { 1: 1, 2: 1 } }));

        const [first, second, third] = await seedUncategorizedTransactions({ count: 3 });

        const response = await helpers.triggerAiCategorization({
          payload: { transactionIds: [first!, second!] },
        });
        expect(response.statusCode).toBe(200);
        expect(response.body.response).toEqual({ enqueued: true, totalCount: 2 });

        await waitForRunToSettle();

        const remaining = await helpers.getAiCategorizationCandidates({ raw: true });
        expect(remaining.totalCount).toBe(1);
        expect(remaining.items.map((transaction) => transaction.id)).toEqual([third]);
      },
      TEST_TIMEOUT_MS,
    );

    it('ignores ids that belong to another user instead of rejecting the request', async () => {
      process.env.GEMINI_API_KEY = VALID_GEMINI_API_KEY;
      global.mswMockServer.use(geminiTextMock());

      await seedUncategorizedTransactions({ count: 2 });

      const otherUser = await helpers.provisionSecondUserWithBaseCurrency();
      const foreignTransactionId = await helpers.asUser({
        cookies: otherUser.cookies,
        fn: async () => {
          const [transactionId] = await seedUncategorizedTransactions({ count: 1 });
          return transactionId!;
        },
      });

      const response = await helpers.triggerAiCategorization({
        payload: { transactionIds: [foreignTransactionId] },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body.response).toEqual({ enqueued: false, totalCount: 0 });

      const remaining = await helpers.getAiCategorizationCandidates({ raw: true });
      expect(remaining.totalCount).toBe(2);
    });

    it(
      'ignores supplied ids that are not candidates',
      async () => {
        process.env.GEMINI_API_KEY = VALID_GEMINI_API_KEY;
        global.mswMockServer.use(geminiTextMock());

        const [candidateId] = await seedUncategorizedTransactions({ count: 1 });
        const transferId = await seedTransferTransaction();
        const categorizedId = await seedManuallyCategorizedTransaction();

        const response = await helpers.triggerAiCategorization({
          payload: { transactionIds: [candidateId!, transferId, categorizedId] },
        });

        expect(response.statusCode).toBe(200);
        expect(response.body.response).toEqual({ enqueued: true, totalCount: 1 });

        await waitForRunToSettle();
      },
      TEST_TIMEOUT_MS,
    );

    it('reports nothing to do and spends no budget when no supplied id is a candidate', async () => {
      process.env.GEMINI_API_KEY = VALID_GEMINI_API_KEY;
      global.mswMockServer.use(geminiTextMock());

      await seedUncategorizedTransactions({ count: 2 });
      const transferId = await seedTransferTransaction();

      // Past the server-key budget of 3, so a consumed attempt would surface as a 429.
      for (let attempt = 0; attempt < 5; attempt++) {
        const response = await helpers.triggerAiCategorization({
          payload: { transactionIds: [transferId, generateRandomRecordId()] },
        });

        expect(response.statusCode).toBe(200);
        expect(response.body.response).toEqual({ enqueued: false, totalCount: 0 });
      }
    });

    it('rejects an empty list instead of widening it to every candidate', async () => {
      process.env.GEMINI_API_KEY = VALID_GEMINI_API_KEY;
      global.mswMockServer.use(geminiTextMock());

      const seededIds = await seedUncategorizedTransactions({ count: 2 });

      const response = await helpers.triggerAiCategorization({ payload: { transactionIds: [] } });
      expect(response.statusCode).toBe(422);

      const remaining = await helpers.getAiCategorizationCandidates({ raw: true });
      expect(remaining.items.map((transaction) => transaction.id).sort()).toEqual([...seededIds].sort());
    });

    it('rejects a list longer than one run can process', async () => {
      process.env.GEMINI_API_KEY = VALID_GEMINI_API_KEY;
      global.mswMockServer.use(geminiTextMock());

      await seedUncategorizedTransactions({ count: 1 });

      const transactionIds = Array.from({ length: AI_CATEGORIZATION_MAX_TRANSACTIONS_PER_RUN + 1 }, () =>
        generateRandomRecordId(),
      );

      const response = await helpers.triggerAiCategorization({ payload: { transactionIds } });

      expect(response.statusCode).toBe(422);
    });
  });

  describe('without any AI configuration', () => {
    useSelfHostWithoutServerAiKeys();

    it('explains what is missing instead of failing with a server error', async () => {
      await seedUncategorizedTransactions({ count: 1 });

      const response = await helpers.triggerAiCategorization();

      expect(response.statusCode).toBe(422);
      expect(helpers.errorMessage({ response })).toEqual(expect.any(String));
    });
  });
});
