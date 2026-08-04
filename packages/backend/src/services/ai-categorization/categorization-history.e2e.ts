import { CATEGORIZATION_SOURCE, CATEGORIZATION_TRIGGER, type RecordId } from '@bt/shared/types';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { app } from '@root/app';
import { API_PREFIX } from '@root/config';
import * as helpers from '@tests/helpers';
import { VALID_GEMINI_API_KEY, createGeminiMock } from '@tests/mocks/gemini/mock-api';
import { startOfDay, subDays } from 'date-fns';
import request from 'supertest';

const HISTORY_URL = `${API_PREFIX}/user/ai/categorization/history`;

const RUN_SETTLE_TIMEOUT_MS = 15_000;
const TEST_TIMEOUT_MS = 60_000;

/** Enough ordinals to cover every run in this file; unknown ones are dropped by the parser. */
const CATEGORIZE_EVERYTHING = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 };

async function seedTransactions({
  count,
  categoryId,
  accountId,
}: {
  count: number;
  categoryId: RecordId;
  accountId: RecordId;
}): Promise<string[]> {
  const today = startOfDay(new Date());
  const ids: string[] = [];

  for (let index = 0; index < count; index++) {
    const [transaction] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId,
        categoryId,
        amount: 100 + index,
        note: `Coffee shop ${index}`,
        time: subDays(today, index).toISOString(),
      }),
      raw: true,
    });
    ids.push(transaction.id);
  }

  return ids;
}

async function runCategorization() {
  const trigger = await helpers.triggerAiCategorization();
  expect(trigger.statusCode).toBe(200);

  await helpers.waitForCategorizationStatus({
    predicate: (status) => status.status === 'idle',
    timeoutMs: RUN_SETTLE_TIMEOUT_MS,
  });
}

const getPage = async (payload?: { limit?: number; offset?: number }) => {
  const response = await helpers.getAiCategorizationHistory({ payload });
  expect(response.statusCode).toBe(200);
  return response.body.response;
};

describe('GET /user/ai/categorization/history', () => {
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
    const response = await request(app).get(HISTORY_URL);

    expect(response.statusCode).toBe(401);
  });

  it('returns an empty list and a zero total when nothing was ever categorized by AI', async () => {
    expect(await getPage()).toEqual({ items: [], totalCount: 0 });
  });

  it('rejects a limit above the allowed maximum', async () => {
    const response = await helpers.getAiCategorizationHistory({ payload: { limit: 500 } });

    expect(response.statusCode).toBe(422);
  });

  it(
    'reports one run whose stamp every categorized transaction shares',
    async () => {
      process.env.GEMINI_API_KEY = VALID_GEMINI_API_KEY;
      global.mswMockServer.use(createGeminiMock({ categorizations: CATEGORIZE_EVERYTHING }));

      const user = await helpers.getUserInfo({ raw: true });
      const account = await helpers.createAccount({ raw: true });
      const seededIds = await seedTransactions({
        count: 3,
        categoryId: user.defaultCategoryId as RecordId,
        accountId: account.id,
      });

      await runCategorization();

      const { items, totalCount } = await getPage();
      expect(totalCount).toBe(1);
      expect(items).toHaveLength(1);
      expect(items[0]!.transactionCount).toBe(3);
      expect(items[0]!.trigger).toBe(CATEGORIZATION_TRIGGER.manual);

      const categorized = await helpers.getTransactionsByIds({ ids: seededIds, raw: true });
      expect(categorized).toHaveLength(3);
      for (const transaction of categorized) {
        expect(transaction.categorizationMeta?.source).toBe(CATEGORIZATION_SOURCE.ai);
        expect(transaction.categorizationMeta?.categorizedAt).toBe(items[0]!.categorizedAt);
        expect(transaction.categorizationMeta?.trigger).toBe(CATEGORIZATION_TRIGGER.manual);
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'lists the newest run first and reports the total only on the first page',
    async () => {
      process.env.GEMINI_API_KEY = VALID_GEMINI_API_KEY;
      global.mswMockServer.use(createGeminiMock({ categorizations: CATEGORIZE_EVERYTHING }));

      const user = await helpers.getUserInfo({ raw: true });
      const defaultCategoryId = user.defaultCategoryId as RecordId;
      const account = await helpers.createAccount({ raw: true });

      await seedTransactions({ count: 2, categoryId: defaultCategoryId, accountId: account.id });
      await runCategorization();

      await seedTransactions({ count: 3, categoryId: defaultCategoryId, accountId: account.id });
      await runCategorization();

      const all = await getPage({ limit: 100 });
      expect(all.totalCount).toBe(2);
      expect(all.items.map((run) => run.transactionCount)).toEqual([3, 2]);
      expect(all.items[0]!.categorizedAt > all.items[1]!.categorizedAt).toBe(true);

      const firstPage = await getPage({ limit: 1, offset: 0 });
      expect(firstPage.totalCount).toBe(2);
      expect(firstPage.items).toEqual([all.items[0]]);

      const secondPage = await getPage({ limit: 1, offset: 1 });
      expect(secondPage.totalCount).toBeNull();
      expect(secondPage.items).toEqual([all.items[1]]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'never surfaces another user runs',
    async () => {
      process.env.GEMINI_API_KEY = VALID_GEMINI_API_KEY;
      global.mswMockServer.use(createGeminiMock({ categorizations: CATEGORIZE_EVERYTHING }));

      const user = await helpers.getUserInfo({ raw: true });
      const account = await helpers.createAccount({ raw: true });
      await seedTransactions({ count: 2, categoryId: user.defaultCategoryId as RecordId, accountId: account.id });

      await runCategorization();
      expect((await getPage()).totalCount).toBe(1);

      const otherUser = await helpers.provisionSecondUserWithBaseCurrency();
      const otherHistory = await helpers.asUser({
        cookies: otherUser.cookies,
        fn: () => helpers.getAiCategorizationHistory({ raw: true }),
      });

      expect(otherHistory).toEqual({ items: [], totalCount: 0 });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'drops a transaction from its run once the user re-categorizes it by hand',
    async () => {
      process.env.GEMINI_API_KEY = VALID_GEMINI_API_KEY;
      global.mswMockServer.use(createGeminiMock({ categorizations: CATEGORIZE_EVERYTHING }));

      const user = await helpers.getUserInfo({ raw: true });
      const account = await helpers.createAccount({ raw: true });
      const seededIds = await seedTransactions({
        count: 3,
        categoryId: user.defaultCategoryId as RecordId,
        accountId: account.id,
      });

      await runCategorization();
      expect((await getPage()).items[0]!.transactionCount).toBe(3);

      // Created after the run, so the AI could not have picked it and the edit is a real change.
      const correction = await helpers.addCustomCategory({ name: 'Groceries', color: '#FF0000', raw: true });
      await helpers.updateTransaction({
        id: seededIds[0]! as RecordId,
        payload: { categoryId: correction.id },
        raw: true,
      });

      const { items, totalCount } = await getPage();
      expect(totalCount).toBe(1);
      expect(items[0]!.transactionCount).toBe(2);

      const corrected = await helpers.getTransactionById({ id: seededIds[0]!, raw: true });
      expect(corrected?.categorizationMeta?.source).toBe(CATEGORIZATION_SOURCE.manual);
    },
    TEST_TIMEOUT_MS,
  );
});
