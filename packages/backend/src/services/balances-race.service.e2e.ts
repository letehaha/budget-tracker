import { BANK_PROVIDER_TYPE, TRANSACTION_TYPES, asCents } from '@bt/shared/types';
import { faker } from '@faker-js/faker';
import { describe, expect, it } from '@jest/globals';
import { connection } from '@models/index';
import * as helpers from '@tests/helpers';
import { VALID_MONOBANK_TOKEN, getMonobankTransactionsMock } from '@tests/mocks/monobank/mock-api';
import { startOfDay, startOfMonth, subDays, subMonths } from 'date-fns';
import { v7 as uuidv7 } from 'uuid';

// Regression suite for the (accountId, date) unique-index race fixed in
// migration 20260606000000-add-unique-index-balances-account-date and the
// `applyIncrementAtSql` + `INSERT … ON CONFLICT` paths in balances.model.ts.
describe('Balances (accountId, date) race regression', () => {
  it('concurrent same-day transactions on a system account produce one row with all increments summed', async () => {
    const initialBalance = 100_000;
    const expenseAmount = 50;
    const txCount = 20;

    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({
        initialBalance,
        currentBalance: initialBalance,
      }),
      raw: true,
    });

    const txTime = startOfDay(new Date()).toISOString();
    const results = await Promise.all(
      Array.from({ length: txCount }, () =>
        helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: expenseAmount,
            transactionType: TRANSACTION_TYPES.expense,
            time: txTime,
          }),
        }),
      ),
    );
    for (const r of results) expect(r.statusCode).toEqual(200);

    const history = helpers.extractResponse(
      await helpers.makeRequest({
        method: 'get',
        url: '/stats/balance-history',
        payload: { accountId: account.id },
      }),
    );

    const todayKey = startOfDay(new Date()).toISOString().slice(0, 10);
    const todayRows = history.filter((row) => row.date === todayKey);
    expect(todayRows.length).toBe(1);
    expect(todayRows[0].amount).toBe(initialBalance - txCount * expenseAmount);
  });

  // Catch site #1 — concurrent writers race on creating the startOfMonth seed
  // row. Triggered when a prior-month balance exists but the current month's
  // first-day row hasn't been seeded yet.
  it('concurrent same-day txs race on the first-of-month seed row', async () => {
    const initialBalance = 100_000;
    const priorMonthExpense = 100;
    const expenseAmount = 50;
    const txCount = 5;

    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({
        initialBalance,
        currentBalance: initialBalance,
      }),
      raw: true,
    });

    const priorMonthDate = subMonths(startOfDay(new Date()), 1);
    const priorTx = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: priorMonthExpense,
        transactionType: TRANSACTION_TYPES.expense,
        time: priorMonthDate.toISOString(),
      }),
    });
    expect(priorTx.statusCode).toEqual(200);

    const todayIso = startOfDay(new Date()).toISOString();
    const results = await Promise.all(
      Array.from({ length: txCount }, () =>
        helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: expenseAmount,
            transactionType: TRANSACTION_TYPES.expense,
            time: todayIso,
          }),
        }),
      ),
    );
    for (const r of results) expect(r.statusCode).toEqual(200);

    const history = helpers.extractResponse(
      await helpers.makeRequest({
        method: 'get',
        url: '/stats/balance-history',
        payload: { accountId: account.id },
      }),
    );

    const firstOfMonthKey = startOfMonth(new Date()).toISOString().slice(0, 10);
    const firstOfMonthRows = history.filter((row) => row.date === firstOfMonthKey);
    expect(firstOfMonthRows.length).toBe(1);
    expect(firstOfMonthRows[0].amount).toBe(initialBalance - priorMonthExpense);

    const todayKey = startOfDay(new Date()).toISOString().slice(0, 10);
    const todayRows = history.filter((row) => row.date === todayKey);
    expect(todayRows.length).toBe(1);
    expect(todayRows[0].amount).toBe(initialBalance - priorMonthExpense - txCount * expenseAmount);
  });

  // Catch sites #2 + #3 — back-dating into the `!latestBalancePrior` branch.
  // Writers race on both the pre-tx seed at (date - 1) AND the tx-date row.
  it('concurrent back-dated txs race on pre-tx seed and tx-date rows', async () => {
    const initialBalance = 100_000;
    const expenseAmount = 50;
    const txCount = 5;

    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({
        initialBalance,
        currentBalance: initialBalance,
      }),
      raw: true,
    });

    const yesterday = subDays(startOfDay(new Date()), 1);
    const results = await Promise.all(
      Array.from({ length: txCount }, () =>
        helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: expenseAmount,
            transactionType: TRANSACTION_TYPES.expense,
            time: yesterday.toISOString(),
          }),
        }),
      ),
    );
    for (const r of results) expect(r.statusCode).toEqual(200);

    const history = helpers.extractResponse(
      await helpers.makeRequest({
        method: 'get',
        url: '/stats/balance-history',
        payload: { accountId: account.id },
      }),
    );

    const dayBeforeKey = subDays(yesterday, 1).toISOString().slice(0, 10);
    const yesterdayKey = yesterday.toISOString().slice(0, 10);
    const todayKey = startOfDay(new Date()).toISOString().slice(0, 10);

    const dayBeforeRows = history.filter((row) => row.date === dayBeforeKey);
    expect(dayBeforeRows.length).toBe(1);
    expect(dayBeforeRows[0].amount).toBe(initialBalance);

    const yesterdayRows = history.filter((row) => row.date === yesterdayKey);
    expect(yesterdayRows.length).toBe(1);
    expect(yesterdayRows[0].amount).toBe(initialBalance - txCount * expenseAmount);

    const todayRows = history.filter((row) => row.date === todayKey);
    expect(todayRows.length).toBe(1);
    expect(todayRows[0].amount).toBe(initialBalance - txCount * expenseAmount);
  });

  // `updateAccountBalance` (Monobank/EnableBanking absolute-balance path).
  // Two passes with same-date txs whose `balance` differs across passes —
  // ON CONFLICT DO UPDATE must collapse each pass to one row, and re-syncing
  // with a different last-tx balance must update the row in place while
  // preserving `id` and `createdAt` (the JSDoc contract).
  it('updateAccountBalance via Monobank: same-date txs collapse to one row, id+createdAt stable across re-sync, last-writer-wins on amount', async () => {
    const today = startOfDay(new Date());
    const txTimeSeconds = today.getTime() / 1000;
    const buildMockTxs = (balances: number[]) =>
      balances.map((bal, i) => ({
        id: faker.string.uuid(),
        time: txTimeSeconds + i * 3600,
        description: '',
        mcc: 0,
        originalMcc: 0,
        hold: false,
        amount: asCents(-1_000),
        operationAmount: asCents(-1_000),
        currencyCode: 980,
        commissionRate: asCents(0),
        cashbackAmount: asCents(0),
        balance: asCents(bal),
        comment: '',
        receiptId: '',
        invoiceId: '',
        counterEdrpou: '',
        counterIban: '',
        counterName: '',
        __mocked: true,
      }));

    const { connectionId } = await helpers.bankDataProviders.connectProvider({
      providerType: BANK_PROVIDER_TYPE.MONOBANK,
      credentials: { apiToken: VALID_MONOBANK_TOKEN },
      raw: true,
    });

    global.mswMockServer.use(getMonobankTransactionsMock({ response: buildMockTxs([95_000, 90_000, 80_000]) }));

    const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
      connectionId,
      raw: true,
    });
    const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
      connectionId,
      accountExternalIds: externalAccounts.map((a) => a.externalId),
      raw: true,
    });
    await helpers.sleep(2000);

    const accountId = syncedAccounts[0]!.id;
    const todayKey = today.toISOString().slice(0, 10);

    const [firstRows] = (await connection.sequelize.query(
      `SELECT id, "createdAt", amount FROM "Balances"
       WHERE "accountId" = :accountId AND "date" = :date`,
      { replacements: { accountId, date: todayKey } },
    )) as [Array<{ id: string; createdAt: string; amount: string | number }>, unknown];
    expect(firstRows.length).toBe(1);
    const firstRow = firstRows[0]!;
    const firstAmount = Number(firstRow.amount);
    expect(firstAmount).toBeGreaterThan(0);

    // Second pass: different last-tx balance — must update in place.
    global.mswMockServer.use(getMonobankTransactionsMock({ response: buildMockTxs([45_000, 40_000, 30_000]) }));
    await helpers.bankDataProviders.syncTransactionsForAccount({
      connectionId,
      accountId,
      raw: true,
    });
    await helpers.sleep(2000);

    const [secondRows] = (await connection.sequelize.query(
      `SELECT id, "createdAt", amount FROM "Balances"
       WHERE "accountId" = :accountId AND "date" = :date`,
      { replacements: { accountId, date: todayKey } },
    )) as [Array<{ id: string; createdAt: string; amount: string | number }>, unknown];
    expect(secondRows.length).toBe(1);
    const secondRow = secondRows[0]!;
    expect(secondRow.id).toBe(firstRow.id);
    expect(new Date(secondRow.createdAt).getTime()).toBe(new Date(firstRow.createdAt).getTime());
    // Last-writer-wins: second pass's last-tx balance is lower → row amount drops.
    expect(Number(secondRow.amount)).toBeLessThan(firstAmount);
  });

  // Replays the migration's dedup step against three controlled duplicates so
  // the `ORDER BY "updatedAt" DESC, "createdAt" DESC, id ASC` tiebreaker is
  // covered. The index must be dropped to seed dups, then restored in a
  // `finally` so the next test still has its guard.
  it('migration dedup retains the newest-updatedAt row per (accountId, date) and drops the rest', async () => {
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload(),
      raw: true,
    });
    const dupDate = subDays(startOfDay(new Date()), 7);
    const dupDateKey = dupDate.toISOString().slice(0, 10);

    const oldestId = uuidv7();
    const middleId = uuidv7();
    const newestId = uuidv7();

    try {
      await connection.sequelize.query('DROP INDEX IF EXISTS "balances_account_id_date_unique"');

      await connection.sequelize.query(
        `INSERT INTO "Balances" ("id", "accountId", "date", "amount", "createdAt", "updatedAt")
         VALUES
           (:oldestId, :accountId, :date, 100, NOW() - INTERVAL '3 hours', NOW() - INTERVAL '3 hours'),
           (:middleId, :accountId, :date, 200, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours'),
           (:newestId, :accountId, :date, 300, NOW() - INTERVAL '1 hour',  NOW() - INTERVAL '1 hour')`,
        {
          replacements: { oldestId, middleId, newestId, accountId: account.id, date: dupDateKey },
        },
      );

      await connection.sequelize.query(
        `DELETE FROM "Balances"
         WHERE id IN (
           SELECT id FROM (
             SELECT
               id,
               ROW_NUMBER() OVER (
                 PARTITION BY "accountId", "date"
                 ORDER BY "updatedAt" DESC, "createdAt" DESC, id ASC
               ) AS rn
             FROM "Balances"
             WHERE "accountId" = :accountId AND "date" = :date
           ) sub
           WHERE sub.rn > 1
         )`,
        {
          replacements: { accountId: account.id, date: dupDateKey },
        },
      );

      const [survivors] = (await connection.sequelize.query(
        `SELECT id, amount FROM "Balances"
         WHERE "accountId" = :accountId AND "date" = :date`,
        {
          replacements: { accountId: account.id, date: dupDateKey },
        },
      )) as [Array<{ id: string; amount: string | number }>, unknown];

      expect(survivors.length).toBe(1);
      const survivor = survivors[0]!;
      expect(survivor.id).toBe(newestId);
      expect(Number(survivor.amount)).toBe(300);
    } finally {
      await connection.sequelize.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "balances_account_id_date_unique"
         ON "Balances" ("accountId", "date")`,
      );
    }
  });
});
