import { CategoryModel, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';
import * as helpers from '@tests/helpers';

describe('[Stats] Spendings by categories – categoryIds filter', () => {
  it('Returns spending grouped by selected categories instead of root', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categoriesList = await helpers.getCategoriesList();

    // Pick a root category and one of its children
    const rootCategory = categoriesList.find((c) => !c.parentId)!;
    const childCategory = categoriesList.find((c) => c.parentId === rootCategory.id)!;

    // Create a nested sub-sub category under the child
    const subChild = await helpers.addCustomCategory({
      parentId: childCategory.id,
      name: 'sub-child-test',
      raw: true,
    });

    // Create transactions: 100 on root, 200 on child, 300 on sub-child
    await Promise.all([
      helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 100, categoryId: rootCategory.id }),
        raw: true,
      }),
      helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 200, categoryId: childCategory.id }),
        raw: true,
      }),
      helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 300, categoryId: subChild.id }),
        raw: true,
      }),
    ]);

    // Without categoryIds: everything grouped under root
    const rootGrouped = await helpers.getSpendingsByCategories({ raw: true });
    expect(rootGrouped[rootCategory.id.toString()].amount).toBe(600); // 100 + 200 + 300

    // With categoryIds selecting only the child: child gets its own (200) + sub-child (300) = 500
    const childGrouped = await helpers.getSpendingsByCategories({
      raw: true,
      categoryIds: [childCategory.id],
    });
    expect(childGrouped[childCategory.id.toString()]).toEqual({
      name: childCategory.name,
      color: childCategory.color,
      amount: 500,
    });
    // Root category should NOT appear (transaction tagged directly on root doesn't belong to childCategory)
    expect(childGrouped[rootCategory.id.toString()]).toBeUndefined();
  });

  it('Pre-initializes selected categories with zero when no transactions match', async () => {
    await helpers.createAccount({ raw: true });
    const categoriesList = await helpers.getCategoriesList();
    const rootCategory = categoriesList.find((c) => !c.parentId)!;

    // Request spending for a category with no transactions
    const result = await helpers.getSpendingsByCategories({
      raw: true,
      categoryIds: [rootCategory.id],
    });

    expect(result[rootCategory.id.toString()]).toEqual({
      name: rootCategory.name,
      color: rootCategory.color,
      amount: 0,
    });
  });

  it('Handles overlapping parent + child selection (most specific match wins)', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categoriesList = await helpers.getCategoriesList();

    const rootCategory = categoriesList.find((c) => !c.parentId)!;
    const childCategory = categoriesList.find((c) => c.parentId === rootCategory.id)!;

    // 100 directly on root, 200 on child
    await Promise.all([
      helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 100, categoryId: rootCategory.id }),
        raw: true,
      }),
      helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 200, categoryId: childCategory.id }),
        raw: true,
      }),
    ]);

    // Select both root and child. Child's transaction maps to child (nearest ancestor in set).
    // Root's transaction maps to root.
    const result = await helpers.getSpendingsByCategories({
      raw: true,
      categoryIds: [rootCategory.id, childCategory.id],
    });

    expect(result[rootCategory.id.toString()].amount).toBe(100);
    expect(result[childCategory.id.toString()].amount).toBe(200);
  });
});

describe('[Stats] Spendings by categories', () => {
  it('Returns correct list of data for simple transactions list', async () => {
    const account = await helpers.createAccount({ raw: true });
    const payload = helpers.buildTransactionPayload({
      accountId: account.id,
      amount: 100,
    });
    const categoriesList = await helpers.getCategoriesList();
    const category = categoriesList.find((i) => i.id === payload.categoryId)!;

    await Promise.all([
      helpers.createTransaction({
        payload,
        raw: true,
      }),
      helpers.createTransaction({
        payload,
        raw: true,
      }),
    ]);

    const data = await helpers.getSpendingsByCategories({ raw: true });

    expect(data).toEqual({
      '1': {
        name: category.name,
        color: category.color,
        amount: 200,
      },
    });
  });
  it(`Returns correct list of data for transactions that have:
      - transfer transactions
      - refunds
      - income transactions
      - different accounts
      - different currencies
  `, async () => {
    const CATEGORIES_AMOUNT_FOR_EACH_NESTING_LEVEL = 2;
    const account = await helpers.createAccount({ raw: true });
    const accountB = await helpers.createAccount({ raw: true });
    const categoriesList = await helpers.getCategoriesList();

    // Prepare root-level categoris
    const rootCategories = categoriesList.filter((c) => !c.parentId).slice(0, CATEGORIES_AMOUNT_FOR_EACH_NESTING_LEVEL);

    // Prepare nested 1-level categories
    const excludedIds = new Set<number>([]);
    const firstLevelNestedCategories = categoriesList.filter((c) => {
      if (c.parentId) {
        if (rootCategories.some((e) => e.id === c.parentId) && !excludedIds.has(c.parentId)) {
          excludedIds.add(c.parentId);
          return true;
        }
      }
      return false;
    });

    // Prepare nested 2-level categories
    const [customCategory1, customCategory2] = await Promise.all(
      firstLevelNestedCategories.map((i) =>
        helpers.addCustomCategory({
          parentId: i.id,
          name: `test-${i.id}`,
          raw: true,
        }),
      ),
    );

    const fullCategoriesList = [
      ...rootCategories,
      ...firstLevelNestedCategories,
      customCategory1,
      customCategory2,
    ].filter(Boolean) as CategoryModel[];

    const payload = helpers.buildTransactionPayload({
      accountId: account.id,
      amount: 200,
    });

    const expenseTransactions = await Promise.all(
      fullCategoriesList.map((c) =>
        helpers.createTransaction({
          payload: {
            ...payload,
            categoryId: c.id,
          },
          raw: true,
        }),
      ),
    );

    // Create transfer transactions just for their existance. They should be ignored by stats
    const transferTxResponse = await helpers.createTransaction({
      payload: {
        ...payload,
        transactionType: TRANSACTION_TYPES.expense,
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
        destinationAmount: 100,
        destinationAccountId: accountB.id,
      },
    });
    expect(transferTxResponse.statusCode).toBe(200);
    // Create income transactions just for their existance and for refunds
    const [[incomeThatWillBeRefunded], [incomeThatRefunds]] = await Promise.all([
      helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          transactionType: TRANSACTION_TYPES.income,
          amount: 300,
        }),
        raw: true,
      }),
      helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          transactionType: TRANSACTION_TYPES.income,
          amount: 100,
        }),
        raw: true,
      }),
    ]);

    // Create two refunds based on income tx:
    // – in first income is being REFUNDED
    // – in second income is REFUNDING the existing expense
    const tx1 = expenseTransactions.flat().find((t) => t!.categoryId === customCategory1!.id);
    const tx2 = expenseTransactions.flat().find((t) => t!.categoryId === customCategory2!.id);
    await Promise.all([
      helpers.createSingleRefund(
        {
          originalTxId: incomeThatWillBeRefunded.id,
          refundTxId: tx1!.id,
        },
        true,
      ),
      helpers.createSingleRefund(
        {
          originalTxId: tx2!.id,
          refundTxId: incomeThatRefunds.id,
        },
        true,
      ),
    ]);

    let spendingsByCategories = await helpers.getSpendingsByCategories({
      raw: true,
    });

    // There is 6 transactions, each of 200. 3 tx per each category. So 200 * 3 = 600
    // 1 transaction refunds income with value 300, so it should fully be "ignored". So 600 - 200 = 400
    // 1 transaction is being refunded by income with value 100, so 600 - (200 - 100) = 500
    // Transfers are ignored
    expect(spendingsByCategories).toEqual({
      '1': {
        name: rootCategories[0]!.name,
        color: rootCategories[0]!.color,
        amount: 400,
      },
      '2': {
        name: rootCategories[1]!.name,
        color: rootCategories[1]!.color,
        amount: 500,
      },
    });

    /**
     * Part 2: Test with different currencies
     * 1. Create two custom currencies UAH and EUR with custom rates
     * 2. Create new accounts with custom currencies, and add transactions to
     * them
     * 3. Make a multi-currency refund
     * 4. Check that after that stats are correct
     */

    const newCurrencies: string[] = [global.BASE_CURRENCY_CODE, 'UAH', 'EUR'];
    await helpers.addUserCurrencies({
      currencyCodes: newCurrencies,
      raw: true,
    });
    const userCurrencies = await helpers.getUserCurrencies();
    const [usdCurrency, uahCurrency, eurCurrency] = newCurrencies.map((c) =>
      userCurrencies.find((i) => i.currency.code === c),
    );

    // Set fake custom exchange rates so it's easier to calculate them in tests
    await helpers.editUserCurrencyExchangeRate({
      pairs: [
        {
          baseCode: usdCurrency!.currency.code,
          quoteCode: uahCurrency!.currency.code,
          rate: 10,
        },
        {
          baseCode: uahCurrency!.currency.code,
          quoteCode: usdCurrency!.currency.code,
          rate: 0.1,
        },
        {
          baseCode: usdCurrency!.currency.code,
          quoteCode: eurCurrency!.currency.code,
          rate: 2,
        },
        {
          baseCode: eurCurrency!.currency.code,
          quoteCode: usdCurrency!.currency.code,
          rate: 0.5,
        },
      ],
    });
    const uahAccount = await helpers.createAccount({
      payload: {
        ...helpers.buildAccountPayload(),
        currencyCode: uahCurrency!.currencyCode,
      },
      raw: true,
    });
    const eurAccount = await helpers.createAccount({
      payload: {
        ...helpers.buildAccountPayload(),
        currencyCode: eurCurrency!.currencyCode,
      },
      raw: true,
    });

    const [eurExpenseTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: eurAccount.id,
        transactionType: TRANSACTION_TYPES.expense,
        amount: 1000,
      }),
      raw: true,
    });
    // Just one more expense with different currency
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: uahAccount.id,
        transactionType: TRANSACTION_TYPES.expense,
        amount: 10000,
      }),
      raw: true,
    });
    const [uahIncomeTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: uahAccount.id,
        transactionType: TRANSACTION_TYPES.income,
        amount: 1000,
      }),
      raw: true,
    });

    spendingsByCategories = await helpers.getSpendingsByCategories({
      raw: true,
    });

    const creationResponse = await helpers.createSingleRefund({
      originalTxId: eurExpenseTx.id,
      refundTxId: uahIncomeTx.id,
    });
    expect(creationResponse.statusCode).toBe(200);
    spendingsByCategories = await helpers.getSpendingsByCategories({
      raw: true,
    });

    expect(spendingsByCategories).toEqual({
      '1': {
        name: rootCategories[0]!.name,
        color: rootCategories[0]!.color,
        // 400 (initial) + 400 (expense eur 500 - uah income refund 100) + 1000 (uah expense)
        amount: 400 + 400 + 1000,
      },
      '2': {
        name: rootCategories[1]!.name,
        color: rootCategories[1]!.color,
        amount: 500,
      },
    });
  });
});
