import { SORT_DIRECTIONS, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';
import { compareAsc, compareDesc, subDays } from 'date-fns';

const dates = {
  income: '2024-08-02T00:00:00Z',
  expense: '2024-08-03T00:00:00Z',
  transfer: '2024-09-03T00:00:00Z',
  refunds: '2024-07-03T00:00:00Z',
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

    const transactions = await Promise.all([
      helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-03-02T10:00:00Z',
          categoryId: 1,
        }),
        raw: true,
      }),
      helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 200,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-03-03T10:00:00Z',
          categoryId: 1,
        }),
        raw: true,
      }),
      helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 300,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-04-01T10:00:00Z',
          categoryId: 1,
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
    it('[success] for `startDate`', async () => {
      await createMockTransactions();

      const res = await helpers.getTransactions({
        startDate: dates.income,
        raw: true,
      });

      expect(res.length).toBe(4); // income, expense, two transfers
    });
    it('[success] for `endDate`', async () => {
      await createMockTransactions();

      const res = await helpers.getTransactions({
        endDate: dates.income,
        raw: true,
      });

      expect(res.length).toBe(3); // income, two refunds
    });
    it('[success] for date range', async () => {
      await createMockTransactions();

      const res = await helpers.getTransactions({
        startDate: dates.income,
        endDate: dates.expense,
        raw: true,
      });

      expect(res.length).toBe(2); // income, expense
    });
    it('[success] for date range with the same value', async () => {
      await createMockTransactions();

      const res = await helpers.getTransactions({
        startDate: dates.income,
        endDate: dates.income,
        raw: true,
      });

      expect(res.length).toBe(1); // income
    });
    it('[success] when `startDate` bigger than `endDate`', async () => {
      await createMockTransactions();

      const res = await helpers.getTransactions({
        startDate: new Date().toISOString(),
        endDate: subDays(new Date(), 1).toISOString(),
        raw: true,
      });

      expect(res.length).toBe(0);
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
    expect(transactions.map((t) => t!.time).sort((a, b) => comparer(new Date(a), new Date(b)))).toEqual(
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

  describe('filter by amount', () => {
    it('`amountLte`', async () => {
      await createMockTransactions();

      const res = await helpers.getTransactions({
        amountLte: 1000,
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
        amountGte: 5000,
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
        amountGte: 2000,
        amountLte: 5000,
        raw: true,
      });

      expect(res.length).toBe(3); // income, expense, 1 of transfers
      res.forEach((tx) => {
        expect(tx.amount >= 2000 && tx.amount <= 5000).toBe(true);
      });
    });

    it('fails when `amountLte` bigger than `amountGte`', async () => {
      await createMockTransactions();

      const res = await helpers.getTransactions({
        amountLte: 2000,
        amountGte: 5000,
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
});
