import {
  FILTER_OPERATION,
  SORT_DIRECTIONS,
  TRANSACTION_SORT_FIELD,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import { Money } from '@common/types/money';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';
import { compareAsc, compareDesc, subDays } from 'date-fns';

const dates = {
  income: '2024-08-02T00:00:00Z',
  expense: '2024-08-03T00:00:00Z',
  transfer: '2024-09-03T00:00:00Z',
  refunds: '2024-07-03T00:00:00Z',
};

// One plain expense + one out-of-wallet transfer + one common transfer pair,
// used by the transferNatures filter cases.
const setupMixedNatures = async () => {
  const accountA = await helpers.createAccount({ raw: true });
  const accountB = await helpers.createAccount({ raw: true });

  const [plain] = await helpers.createTransaction({
    payload: helpers.buildTransactionPayload({ accountId: accountA.id, amount: 100 }),
    raw: true,
  });
  const [outOfWallet] = await helpers.createTransaction({
    payload: {
      ...helpers.buildTransactionPayload({ accountId: accountA.id, amount: 200 }),
      transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
    },
    raw: true,
  });
  const [transferBase, transferOpposite] = await helpers.createTransaction({
    payload: {
      ...helpers.buildTransactionPayload({ accountId: accountA.id, amount: 300 }),
      transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
      destinationAmount: 300,
      destinationAccountId: accountB.id,
    },
    raw: true,
  });

  return { plain, outOfWallet, transferBase, transferOpposite };
};

describe('Retrieve transactions with filters', () => {
  const createMockTransactions = async () => {
    const accountA = await helpers.createAccount({ raw: true });
    const {
      currencies: [currencyB],
    } = await helpers.addUserCurrencies({ currencyCodes: ['UAH'], raw: true });
    const accountB = await helpers.createAccount({
      payload: {
        ...helpers.buildAccountPayload(),
        currencyCode: currencyB!.currencyCode,
      },
      raw: true,
    });

    const [income] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: accountA.id,
        amount: 2000,
        transactionType: TRANSACTION_TYPES.income,
        time: dates.income,
      }),
      raw: true,
    });
    const [expense] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: accountB.id,
        amount: 2000,
        transactionType: TRANSACTION_TYPES.expense,
        time: dates.expense,
      }),
      raw: true,
    });
    const [transferIncome, transferExpense] = await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({
          accountId: accountA.id,
          amount: 5000,
        }),
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
        destinationAmount: 10000,
        destinationAccountId: accountB.id,
        time: dates.transfer,
      },
      raw: true,
    });

    const [refundOriginal] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: accountA.id,
        amount: 1000,
        transactionType: TRANSACTION_TYPES.income,
        time: dates.refunds,
      }),
      raw: true,
    });
    const refundTxPayload = {
      ...helpers.buildTransactionPayload({
        accountId: accountA.id,
        amount: 1000,
        transactionType: TRANSACTION_TYPES.expense,
        time: dates.refunds,
      }),
      refundForTxId: refundOriginal.id,
    };
    const [refundTx] = await helpers.createTransaction({
      payload: refundTxPayload,
      raw: true,
    });

    return {
      income,
      expense,
      transferIncome,
      transferExpense,
      refundOriginal,
      refundTx,
    };
  };

  it('should retrieve transactions filtered by budgetIds correctly', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();
    const firstCategoryId = categories[0]!.id;

    const transactions = await Promise.all([
      helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-03-02T10:00:00Z',
          categoryId: firstCategoryId,
        }),
        raw: true,
      }),
      helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 200,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-03-03T10:00:00Z',
          categoryId: firstCategoryId,
        }),
        raw: true,
      }),
      helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 300,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-04-01T10:00:00Z',
          categoryId: firstCategoryId,
        }),
        raw: true,
      }),
    ]);

    const budget = await helpers.createCustomBudget({
      name: 'Test Budget',
      startDate: '2025-03-01T00:00:00Z',
      endDate: '2025-03-04T23:59:59Z',
      autoInclude: true,
      limitAmount: 500,
      raw: true,
    });

    const res = await helpers.getTransactions({
      budgetIds: [budget.id],
      limit: 30,
      raw: true,
    });

    expect(res.length).toBe(2);
    const transactionIds = res.map((t) => t.id);
    expect(transactionIds).toContain(transactions[0][0].id);
    expect(transactionIds).toContain(transactions[1][0].id);
    expect(transactionIds).not.toContain(transactions[2][0].id);
  });

  describe('filtered by dates', () => {
    it('[success] for `from`', async () => {
      await createMockTransactions();

      const res = await helpers.getTransactions({
        from: dates.income,
        raw: true,
      });

      expect(res.length).toBe(4); // income, expense, two transfers
    });
    it('[success] for `to`', async () => {
      await createMockTransactions();

      const res = await helpers.getTransactions({
        to: dates.income,
        raw: true,
      });

      expect(res.length).toBe(3); // income, two refunds
    });
    it('[success] for date range', async () => {
      await createMockTransactions();

      const res = await helpers.getTransactions({
        from: dates.income,
        to: dates.expense,
        raw: true,
      });

      expect(res.length).toBe(2); // income, expense
    });
    it('[success] for date range with the same value', async () => {
      await createMockTransactions();

      const res = await helpers.getTransactions({
        from: dates.income,
        to: dates.income,
        raw: true,
      });

      expect(res.length).toBe(1); // income
    });
    it('[fail] when `from` bigger than `to`', async () => {
      await createMockTransactions();

      const response = await helpers.getTransactions({
        from: new Date().toISOString(),
        to: subDays(new Date(), 1).toISOString(),
        raw: false,
      });

      expect(response.statusCode).toEqual(ERROR_CODES.ValidationError);
    });
  });

  describe('pagination (offset)', () => {
    // Default sort is `time` descending, so pages walk newest → oldest.
    const times = [
      '2024-06-01T00:00:00Z',
      '2024-06-02T00:00:00Z',
      '2024-06-03T00:00:00Z',
      '2024-06-04T00:00:00Z',
      '2024-06-05T00:00:00Z',
    ];

    const seedPaginationTransactions = async () => {
      const account = await helpers.createAccount({ raw: true });
      for (const time of times) {
        await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 100, time }),
          raw: true,
        });
      }
      return account;
    };

    it('[success] walks non-overlapping pages via `offset`', async () => {
      const account = await seedPaginationTransactions();

      const page1 = await helpers.getTransactions({ accountIds: [account.id], limit: 2, offset: 0, raw: true });
      const page2 = await helpers.getTransactions({ accountIds: [account.id], limit: 2, offset: 2, raw: true });
      const page3 = await helpers.getTransactions({ accountIds: [account.id], limit: 2, offset: 4, raw: true });

      expect(page1.length).toBe(2);
      expect(page2.length).toBe(2);
      expect(page3.length).toBe(1);

      const isoTimes = (page: typeof page1) => page.map((t) => new Date(t.time).toISOString());

      // Newest-first ordering carries across pages.
      expect(isoTimes(page1)).toEqual(['2024-06-05T00:00:00.000Z', '2024-06-04T00:00:00.000Z']);
      expect(isoTimes(page2)).toEqual(['2024-06-03T00:00:00.000Z', '2024-06-02T00:00:00.000Z']);
      expect(isoTimes(page3)).toEqual(['2024-06-01T00:00:00.000Z']);

      // No row appears on two pages.
      const ids = [...page1, ...page2, ...page3].map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('[success] omitted `offset` defaults to the first page', async () => {
      const account = await seedPaginationTransactions();

      const firstPage = await helpers.getTransactions({ accountIds: [account.id], limit: 2, raw: true });

      expect(firstPage.map((t) => new Date(t.time).toISOString())).toEqual([
        '2024-06-05T00:00:00.000Z',
        '2024-06-04T00:00:00.000Z',
      ]);
    });
  });

  it('should retrieve transactions filtered by transactionType', async () => {
    await createMockTransactions();

    const res = await helpers.getTransactions({
      transactionType: TRANSACTION_TYPES.expense,
      raw: true,
    });

    expect(res.length).toBe(3); // expense, 1 of transfers, 1 of refunds
    expect(res.every((t) => t.transactionType === TRANSACTION_TYPES.expense)).toBe(true);
  });

  it('should retrieve transactions excluding transfers', async () => {
    await createMockTransactions();

    const res = await helpers.getTransactions({
      excludeTransfer: true,
      raw: true,
    });

    expect(res.length).toBe(4); // income, expense, refunds
    expect(res.every((t) => t.transferNature === TRANSACTION_TRANSFER_NATURE.not_transfer)).toBe(true);
  });

  it('should retrieve transactions excluding refunds', async () => {
    await createMockTransactions();

    const res = await helpers.getTransactions({
      excludeRefunds: true,
      raw: true,
    });

    expect(res.length).toBe(4);
    expect(res.every((t) => t.refundLinked === false)).toBe(true);
  });

  it('should retrieve only transfers using transferFilter=only', async () => {
    await createMockTransactions();

    const res = await helpers.getTransactions({
      transferFilter: FILTER_OPERATION.only,
      raw: true,
    });

    expect(res.length).toBe(2); // transferIncome, transferExpense
    expect(res.every((t) => t.transferNature !== TRANSACTION_TRANSFER_NATURE.not_transfer)).toBe(true);
  });

  it('should retrieve only refund-linked transactions using refundFilter=only', async () => {
    await createMockTransactions();

    const res = await helpers.getTransactions({
      refundFilter: FILTER_OPERATION.only,
      raw: true,
    });

    expect(res.length).toBe(2); // refundOriginal, refundTx
    expect(res.every((t) => t.refundLinked === true)).toBe(true);
  });

  it('should exclude transfers using transferFilter=exclude', async () => {
    await createMockTransactions();

    const res = await helpers.getTransactions({
      transferFilter: FILTER_OPERATION.exclude,
      raw: true,
    });

    expect(res.length).toBe(4); // income, expense, refunds
    expect(res.every((t) => t.transferNature === TRANSACTION_TRANSFER_NATURE.not_transfer)).toBe(true);
  });

  it('should exclude refunds using refundFilter=exclude', async () => {
    await createMockTransactions();

    const res = await helpers.getTransactions({
      refundFilter: FILTER_OPERATION.exclude,
      raw: true,
    });

    expect(res.length).toBe(4);
    expect(res.every((t) => t.refundLinked === false)).toBe(true);
  });

  it('should use OR logic when both transferFilter and refundFilter are "only"', async () => {
    await createMockTransactions();

    const res = await helpers.getTransactions({
      transferFilter: FILTER_OPERATION.only,
      refundFilter: FILTER_OPERATION.only,
      raw: true,
    });

    // Should return transfers OR refunds (not AND), so 4 total:
    // transferIncome, transferExpense, refundOriginal, refundTx
    expect(res.length).toBe(4);
    expect(
      res.every((t) => t.transferNature !== TRANSACTION_TRANSFER_NATURE.not_transfer || t.refundLinked === true),
    ).toBe(true);
  });

  it('should return all transactions using transferFilter=all', async () => {
    await createMockTransactions();

    const res = await helpers.getTransactions({
      transferFilter: FILTER_OPERATION.all,
      raw: true,
    });

    expect(res.length).toBe(6);
  });

  it.each([
    [SORT_DIRECTIONS.desc, compareDesc],
    [SORT_DIRECTIONS.asc, compareAsc],
  ])('should retrieve transactions sorted by time `%s`', async (direction, comparer) => {
    const transactions = Object.values(await createMockTransactions());

    const res = await helpers.getTransactions({
      order: direction,
      raw: true,
    });

    expect(res.length).toBe(6);
    expect(transactions.map((t) => t!.time).toSorted((a, b) => comparer(new Date(a), new Date(b)))).toEqual(
      res.map((t) => t.time),
    );
  });

  it('should retrieve transactions filtered by accountIds', async () => {
    const { expense } = await createMockTransactions();

    const res = await helpers.getTransactions({
      accountIds: [expense.accountId],
      raw: true,
    });

    expect(res.length).toBe(2); // expense, 1 of transfers
    expect(res.every((t) => t.accountId === expense.accountId)).toBe(true);
  });

  describe('excludeAccountIds', () => {
    it('excludes transactions from the specified account', async () => {
      const { income } = await createMockTransactions();

      const res = await helpers.getTransactions({
        excludeAccountIds: [income.accountId],
        raw: true,
      });

      // income is in accountA, expense is in accountB
      // accountA has: income, transferIncome, refundOriginal, refundTx (4 txs)
      // accountB has: expense, transferExpense (2 txs)
      expect(res.length).toBe(2);
      expect(res.every((t) => t.accountId !== income.accountId)).toBe(true);
    });

    it('excludes transactions from multiple accounts', async () => {
      const { income, expense } = await createMockTransactions();

      const res = await helpers.getTransactions({
        excludeAccountIds: [income.accountId, expense.accountId],
        raw: true,
      });

      expect(res.length).toBe(0);
    });

    it('returns all transactions when excludeAccountIds is not provided', async () => {
      await createMockTransactions();

      const res = await helpers.getTransactions({ raw: true });

      expect(res.length).toBe(6);
    });
  });

  describe('filter by amount', () => {
    it('`amountLte`', async () => {
      await createMockTransactions();

      const res = await helpers.getTransactions({
        amountLte: Money.fromDecimal(1000),
        raw: true,
      });

      expect(res.length).toBe(2); // refunds
      res.forEach((tx) => {
        expect(tx.amount).toBeGreaterThanOrEqual(1000);
      });
    });
    it('`amountGte`', async () => {
      await createMockTransactions();

      const res = await helpers.getTransactions({
        amountGte: Money.fromDecimal(5000),
        raw: true,
      });

      expect(res.length).toBe(2); // transfers
      res.forEach((tx) => {
        expect(tx.amount).toBeGreaterThanOrEqual(5000);
      });
    });
    it('both `amountLte` and `amountGte`', async () => {
      await createMockTransactions();

      const res = await helpers.getTransactions({
        amountGte: Money.fromDecimal(2000),
        amountLte: Money.fromDecimal(5000),
        raw: true,
      });

      expect(res.length).toBe(3); // income, expense, 1 of transfers
      res.forEach((tx) => {
        expect(Number(tx.amount) >= 2000 && Number(tx.amount) <= 5000).toBe(true);
      });
    });

    it('fails when `amountLte` bigger than `amountGte`', async () => {
      await createMockTransactions();

      const res = await helpers.getTransactions({
        amountLte: Money.fromDecimal(2000),
        amountGte: Money.fromDecimal(5000),
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });

  describe('filter by note', () => {
    it('works correctly', async () => {
      const accountA = await helpers.createAccount({ raw: true });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: accountA.id,
          amount: 2000,
          transactionType: TRANSACTION_TYPES.income,
          note: 'test something test',
        }),
      });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: accountA.id,
          amount: 2000,
          transactionType: TRANSACTION_TYPES.income,
          note: 'test something test twice',
        }),
      });

      const res = (
        await Promise.all(
          ['something', 'SoMeThInG', 'test,twice', 'twice', 'random-text'].map((t) =>
            helpers.getTransactions({
              noteSearch: t,
              raw: true,
            }),
          ),
        )
      ).map((items) => items?.length ?? 0);

      expect(res).toEqual([
        2, // both transactions contain it
        2, // case-insinsitive
        2, // comma-separated, both have at aleast one value
        1, // only one contains it
        0, // none contain random one
      ]);
    });

    it('fails when incorrect param ', async () => {
      const accountA = await helpers.createAccount({ raw: true });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: accountA.id,
          amount: 2000,
          transactionType: TRANSACTION_TYPES.income,
          note: 'test something test',
        }),
      });

      const res = await helpers.getTransactions({
        noteSearch: {} as unknown as string,
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('works fine with empty param', async () => {
      const accountA = await helpers.createAccount({ raw: true });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: accountA.id,
          amount: 2000,
          transactionType: TRANSACTION_TYPES.income,
          note: 'test something test',
        }),
      });

      const res = await helpers.getTransactions({
        noteSearch: '',
      });

      expect(res.statusCode).toBe(200);
      expect(helpers.extractResponse(res!).length).toBe(1);
    });

    it('works fine with incorrect format', async () => {
      const accountA = await helpers.createAccount({ raw: true });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: accountA.id,
          amount: 2000,
          transactionType: TRANSACTION_TYPES.income,
          note: 'test something test',
        }),
      });

      const res = await helpers.getTransactions({
        noteSearch: ',,some,,',
      });

      expect(res.statusCode).toBe(200);
      expect(helpers.extractResponse(res!).length).toBe(1);
    });
  });

  describe('sorting via sortBy + order', () => {
    it('sorts by refAmount in both directions', async () => {
      const account = await helpers.createAccount({ raw: true });

      for (const amount of [300, 100, 200]) {
        await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({ accountId: account.id, amount }),
          raw: true,
        });
      }

      const ascending = await helpers.getTransactions({
        sortBy: TRANSACTION_SORT_FIELD.refAmount,
        order: SORT_DIRECTIONS.asc,
        raw: true,
      });
      expect(ascending.map((tx) => Number(tx.refAmount))).toEqual([100, 200, 300]);

      const descending = await helpers.getTransactions({
        sortBy: TRANSACTION_SORT_FIELD.refAmount,
        order: SORT_DIRECTIONS.desc,
        raw: true,
      });
      expect(descending.map((tx) => Number(tx.refAmount))).toEqual([300, 200, 100]);
    });

    it('sorts by account name', async () => {
      const accountZ = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ name: 'zzz-account' }),
        raw: true,
      });
      const accountA = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ name: 'aaa-account' }),
        raw: true,
      });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: accountZ.id, amount: 100 }),
        raw: true,
      });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: accountA.id, amount: 100 }),
        raw: true,
      });

      const result = await helpers.getTransactions({
        sortBy: TRANSACTION_SORT_FIELD.accountName,
        order: SORT_DIRECTIONS.asc,
        raw: true,
      });

      expect(result.map((tx) => tx.accountId)).toEqual([accountA.id, accountZ.id]);
    });

    it('rejects unknown sortBy values', async () => {
      const response = await helpers.makeRequest({
        method: 'get',
        url: '/transactions',
        payload: { sortBy: 'definitely-not-a-field' },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });

  describe('transferNatures filter', () => {
    it('includes only the requested natures', async () => {
      const { plain, outOfWallet, transferBase, transferOpposite } = await setupMixedNatures();

      const result = await helpers.getTransactions({
        transferNatures: [TRANSACTION_TRANSFER_NATURE.not_transfer, TRANSACTION_TRANSFER_NATURE.transfer_out_wallet],
        raw: true,
      });

      const ids = result.map((tx) => tx.id);
      expect(ids).toContain(plain.id);
      expect(ids).toContain(outOfWallet.id);
      expect(ids).not.toContain(transferBase.id);
      expect(ids).not.toContain(transferOpposite!.id);
    });

    it('can isolate a single transfer kind without plain transactions', async () => {
      const { plain, outOfWallet, transferBase, transferOpposite } = await setupMixedNatures();

      const result = await helpers.getTransactions({
        transferNatures: [TRANSACTION_TRANSFER_NATURE.common_transfer],
        raw: true,
      });

      const ids = result.map((tx) => tx.id);
      expect(ids).toContain(transferBase.id);
      expect(ids).toContain(transferOpposite!.id);
      expect(ids).not.toContain(plain.id);
      expect(ids).not.toContain(outOfWallet.id);
    });

    it('supersedes transferFilter when both are provided', async () => {
      const { plain, transferBase } = await setupMixedNatures();

      // transferFilter=exclude alone would drop transfers; the explicit natures
      // list wins and keeps them.
      const result = await helpers.getTransactions({
        transferFilter: FILTER_OPERATION.exclude,
        transferNatures: [TRANSACTION_TRANSFER_NATURE.common_transfer],
        raw: true,
      });

      const ids = result.map((tx) => tx.id);
      expect(ids).toContain(transferBase.id);
      expect(ids).not.toContain(plain.id);
    });

    it('rejects unknown nature values', async () => {
      const response = await helpers.makeRequest({
        method: 'get',
        url: '/transactions',
        payload: { transferNatures: 'not-a-real-nature' },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });
});
