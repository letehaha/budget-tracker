import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

describe('[Stats] Cash flow - excluded categories with sub-categories', () => {
  it('excludes sub-categories of excluded parent categories from cash flow', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categoriesList = await helpers.getCategoriesList();

    const rootCategories = categoriesList.filter((c) => !c.parentId);
    const regularCategory = rootCategories[0]!;
    const parentExcludedCategory = rootCategories[1]!;

    // Create a sub-category under the category that will be excluded
    const childCategory = await helpers.addCustomCategory({
      parentId: parentExcludedCategory.id,
      name: 'child-of-excluded',
      raw: true,
    });

    // Create expense in regular category: 500
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 500,
        categoryId: regularCategory.id,
        time: new Date('2025-03-15').toISOString(),
      }),
      raw: true,
    });

    // Create expense in CHILD of excluded parent: 300
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 300,
        categoryId: childCategory.id,
        time: new Date('2025-03-15').toISOString(),
      }),
      raw: true,
    });

    // Create expense directly in excluded parent: 200
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 200,
        categoryId: parentExcludedCategory.id,
        time: new Date('2025-03-15').toISOString(),
      }),
      raw: true,
    });

    // Verify totals WITHOUT exclusion
    const beforeExclusion = await helpers.getCashFlow({
      from: '2025-03-01',
      to: '2025-03-31',
      granularity: 'monthly',
      excludeCategories: false,
      raw: true,
    });

    expect(beforeExclusion.totals.expenses).toBe(1000);

    // Exclude the PARENT category
    await helpers.editExcludedCategories({
      addIds: [parentExcludedCategory.id],
      raw: true,
    });

    // With exclusion enabled, both parent (200) and child (300) should be excluded
    // Only regular category (500) should remain
    const afterExclusion = await helpers.getCashFlow({
      from: '2025-03-01',
      to: '2025-03-31',
      granularity: 'monthly',
      excludeCategories: true,
      raw: true,
    });

    expect(afterExclusion.totals.expenses).toBe(500);

    // Verify per-period data too
    expect(afterExclusion.periods).toHaveLength(1);
    expect(afterExclusion.periods[0]!.expenses).toBe(500);

    // Verify category breakdown only contains the regular category
    const categories = afterExclusion.periods[0]!.categories ?? [];
    expect(categories).toHaveLength(1);
    expect(categories[0]!.categoryId).toBe(regularCategory.id);
    expect(categories[0]!.expenseAmount).toBe(500);
  });

  it('excludes deeply nested sub-categories (3 levels deep)', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categoriesList = await helpers.getCategoriesList();

    const rootCategories = categoriesList.filter((c) => !c.parentId);
    const regularCategory = rootCategories[0]!;
    const excludedRoot = rootCategories[1]!;

    // Create 2-level nesting: excludedRoot → child → grandchild
    const childCategory = await helpers.addCustomCategory({
      parentId: excludedRoot.id,
      name: 'child-level',
      raw: true,
    });
    const grandchildCategory = await helpers.addCustomCategory({
      parentId: childCategory.id,
      name: 'grandchild-level',
      raw: true,
    });

    // Expense in regular category: 400
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 400,
        categoryId: regularCategory.id,
        time: new Date('2025-04-15').toISOString(),
      }),
      raw: true,
    });

    // Expense in grandchild of excluded: 600
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 600,
        categoryId: grandchildCategory.id,
        time: new Date('2025-04-15').toISOString(),
      }),
      raw: true,
    });

    // Exclude the root parent
    await helpers.editExcludedCategories({
      addIds: [excludedRoot.id],
      raw: true,
    });

    const result = await helpers.getCashFlow({
      from: '2025-04-01',
      to: '2025-04-30',
      granularity: 'monthly',
      excludeCategories: true,
      raw: true,
    });

    // Only the regular category expense (400) should remain
    expect(result.totals.expenses).toBe(400);
  });
});
