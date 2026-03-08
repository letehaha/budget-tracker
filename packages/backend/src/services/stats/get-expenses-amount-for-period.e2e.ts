import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

describe('[Stats] Get expenses amount for period', () => {
  it('returns correct total for a period', async () => {
    const account = await helpers.createAccount({ raw: true });
    const payload = helpers.buildTransactionPayload({
      accountId: account.id,
      amount: 100,
      time: new Date('2025-01-15').toISOString(),
    });

    await helpers.createTransaction({ payload, raw: true });
    await helpers.createTransaction({ payload, raw: true });

    const amount = await helpers.getExpensesAmountForPeriod({
      from: '2025-01-01',
      to: '2025-01-31',
      raw: true,
    });

    expect(amount).toBe(200);
  });

  it('respects excluded categories in expenses amount for ALL periods', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categoriesList = await helpers.getCategoriesList();

    // Pick two distinct root categories
    const rootCategories = categoriesList.filter((c) => !c.parentId);
    const regularCategory = rootCategories[0]!;
    const excludedCategory = rootCategories[1]!;

    // Period 1 (Jan 2025): regular=500, excluded=200 → total=700, filtered=500
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 500,
        categoryId: regularCategory.id,
        time: new Date('2025-01-15').toISOString(),
      }),
      raw: true,
    });
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 200,
        categoryId: excludedCategory.id,
        time: new Date('2025-01-15').toISOString(),
      }),
      raw: true,
    });

    // Period 2 (Feb 2025): regular=300, excluded=400 → total=700, filtered=300
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 300,
        categoryId: regularCategory.id,
        time: new Date('2025-02-15').toISOString(),
      }),
      raw: true,
    });
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 400,
        categoryId: excludedCategory.id,
        time: new Date('2025-02-15').toISOString(),
      }),
      raw: true,
    });

    // Verify totals WITHOUT exclusion
    const janTotalBefore = await helpers.getExpensesAmountForPeriod({
      from: '2025-01-01',
      to: '2025-01-31',
      raw: true,
    });
    const febTotalBefore = await helpers.getExpensesAmountForPeriod({
      from: '2025-02-01',
      to: '2025-02-28',
      raw: true,
    });

    expect(janTotalBefore).toBe(700);
    expect(febTotalBefore).toBe(700);

    // Now exclude the category
    await helpers.editExcludedCategories({
      addIds: [excludedCategory.id],
      raw: true,
    });

    // Verify totals WITH exclusion - both periods should exclude the category
    const janTotalAfter = await helpers.getExpensesAmountForPeriod({
      from: '2025-01-01',
      to: '2025-01-31',
      raw: true,
    });
    const febTotalAfter = await helpers.getExpensesAmountForPeriod({
      from: '2025-02-01',
      to: '2025-02-28',
      raw: true,
    });

    // Both periods should only have the regular category amounts
    expect(janTotalAfter).toBe(500);
    expect(febTotalAfter).toBe(300);
  });

  it('respects excluded categories in spendings-by-categories for ALL periods', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categoriesList = await helpers.getCategoriesList();

    const rootCategories = categoriesList.filter((c) => !c.parentId);
    const regularCategory = rootCategories[0]!;
    const excludedCategory = rootCategories[1]!;

    // Period 1 (Jan 2025)
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 500,
        categoryId: regularCategory.id,
        time: new Date('2025-01-15').toISOString(),
      }),
      raw: true,
    });
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 200,
        categoryId: excludedCategory.id,
        time: new Date('2025-01-15').toISOString(),
      }),
      raw: true,
    });

    // Period 2 (Feb 2025)
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 300,
        categoryId: regularCategory.id,
        time: new Date('2025-02-15').toISOString(),
      }),
      raw: true,
    });
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 400,
        categoryId: excludedCategory.id,
        time: new Date('2025-02-15').toISOString(),
      }),
      raw: true,
    });

    // Exclude the category
    await helpers.editExcludedCategories({
      addIds: [excludedCategory.id],
      raw: true,
    });

    // Verify spendings for both periods only contain the regular category
    const janSpendings = await helpers.getSpendingsByCategories({
      from: '2025-01-01',
      to: '2025-01-31',
      raw: true,
    });
    const febSpendings = await helpers.getSpendingsByCategories({
      from: '2025-02-01',
      to: '2025-02-28',
      raw: true,
    });

    // Jan should only have regular category
    expect(Object.keys(janSpendings)).toHaveLength(1);
    expect(janSpendings[regularCategory.id]).toEqual({
      name: regularCategory.name,
      color: regularCategory.color,
      amount: 500,
    });

    // Feb should only have regular category
    expect(Object.keys(febSpendings)).toHaveLength(1);
    expect(febSpendings[regularCategory.id]).toEqual({
      name: regularCategory.name,
      color: regularCategory.color,
      amount: 300,
    });
  });

  it('excludes sub-categories of excluded parent categories', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categoriesList = await helpers.getCategoriesList();

    const rootCategories = categoriesList.filter((c) => !c.parentId);
    const regularCategory = rootCategories[0]!;
    const parentExcludedCategory = rootCategories[1]!;

    // Create a sub-category under the excluded parent
    const childCategory = await helpers.addCustomCategory({
      parentId: parentExcludedCategory.id,
      name: 'child-of-excluded',
      raw: true,
    });

    // Create transactions: one in the regular category, one in the child of excluded
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 500,
        categoryId: regularCategory.id,
        time: new Date('2025-03-15').toISOString(),
      }),
      raw: true,
    });
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 300,
        categoryId: childCategory.id,
        time: new Date('2025-03-15').toISOString(),
      }),
      raw: true,
    });

    // Exclude the PARENT category
    await helpers.editExcludedCategories({
      addIds: [parentExcludedCategory.id],
      raw: true,
    });

    // The child category's transactions should also be excluded
    const amount = await helpers.getExpensesAmountForPeriod({
      from: '2025-03-01',
      to: '2025-03-31',
      raw: true,
    });

    expect(amount).toBe(500);

    // Verify spendings don't contain the excluded parent category
    const spendings = await helpers.getSpendingsByCategories({
      from: '2025-03-01',
      to: '2025-03-31',
      raw: true,
    });

    expect(Object.keys(spendings)).toHaveLength(1);
    expect(spendings[regularCategory.id]).toEqual({
      name: regularCategory.name,
      color: regularCategory.color,
      amount: 500,
    });
  });
});
