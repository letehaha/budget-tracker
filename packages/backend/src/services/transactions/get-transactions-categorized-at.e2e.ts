import { CATEGORIZATION_SOURCE, type RecordId } from '@bt/shared/types';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { VALID_GEMINI_API_KEY, createGeminiMock } from '@tests/mocks/gemini/mock-api';
import { startOfDay, subDays } from 'date-fns';

const RUN_SETTLE_TIMEOUT_MS = 15_000;
const TEST_TIMEOUT_MS = 60_000;

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

/** Categorizes every seeded transaction and returns the run's shared stamp. */
async function runCategorization(): Promise<string> {
  const trigger = await helpers.triggerAiCategorization();
  expect(trigger.statusCode).toBe(200);

  await helpers.waitForCategorizationStatus({
    predicate: (status) => status.status === 'idle',
    timeoutMs: RUN_SETTLE_TIMEOUT_MS,
  });

  const history = await helpers.getAiCategorizationHistory({ raw: true });
  expect(history.items).toHaveLength(1);

  return history.items[0]!.categorizedAt;
}

describe('GET /transactions — categorizedAt filter', () => {
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

  it('rejects a stamp that is not an ISO datetime', async () => {
    const response = await helpers.getTransactions({ categorizedAt: 'yesterday' });

    expect(response.statusCode).toBe(422);
  });

  it('returns an empty list for a stamp no run ever wrote', async () => {
    const account = await helpers.createAccount({ raw: true });
    await seedTransactions({ count: 2, categoryId: global.DEFAULT_CATEGORY_ID, accountId: account.id });

    const transactions = await helpers.getTransactions({
      categorizedAt: new Date().toISOString(),
      raw: true,
    });

    expect(transactions).toEqual([]);
  });

  it(
    'returns exactly the transactions of the requested run, alone and combined with the source filter',
    async () => {
      process.env.GEMINI_API_KEY = VALID_GEMINI_API_KEY;
      global.mswMockServer.use(createGeminiMock({ categorizations: { 1: 1, 2: 1, 3: 1 } }));

      const user = await helpers.getUserInfo({ raw: true });
      const account = await helpers.createAccount({ raw: true });
      const seededIds = await seedTransactions({
        count: 3,
        categoryId: user.defaultCategoryId as RecordId,
        accountId: account.id,
      });

      const categorizedAt = await runCategorization();

      // Untouched by the run: created afterwards, so it must never match the stamp.
      const [untouchedId] = await seedTransactions({
        count: 1,
        categoryId: user.defaultCategoryId as RecordId,
        accountId: account.id,
      });

      const runTransactions = await helpers.getTransactions({ categorizedAt, raw: true });
      expect(runTransactions.map((tx) => tx.id).sort()).toEqual([...seededIds].sort());
      expect(runTransactions.map((tx) => tx.id)).not.toContain(untouchedId);

      const runAndSource = await helpers.getTransactions({
        categorizedAt,
        categorizationSource: CATEGORIZATION_SOURCE.ai,
        raw: true,
      });
      expect(runAndSource.map((tx) => tx.id).sort()).toEqual([...seededIds].sort());

      const wrongSource = await helpers.getTransactions({
        categorizedAt,
        categorizationSource: CATEGORIZATION_SOURCE.manual,
        raw: true,
      });
      expect(wrongSource).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'stops matching a transaction the user re-categorized by hand',
    async () => {
      process.env.GEMINI_API_KEY = VALID_GEMINI_API_KEY;
      global.mswMockServer.use(createGeminiMock({ categorizations: { 1: 1, 2: 1 } }));

      const user = await helpers.getUserInfo({ raw: true });
      const account = await helpers.createAccount({ raw: true });
      const seededIds = await seedTransactions({
        count: 2,
        categoryId: user.defaultCategoryId as RecordId,
        accountId: account.id,
      });

      const categorizedAt = await runCategorization();

      const correction = await helpers.addCustomCategory({ name: 'Groceries', color: '#FF0000', raw: true });
      await helpers.updateTransaction({
        id: seededIds[0]! as RecordId,
        payload: { categoryId: correction.id },
        raw: true,
      });

      const runTransactions = await helpers.getTransactions({ categorizedAt, raw: true });
      expect(runTransactions.map((tx) => tx.id)).toEqual([seededIds[1]]);
    },
    TEST_TIMEOUT_MS,
  );
});
