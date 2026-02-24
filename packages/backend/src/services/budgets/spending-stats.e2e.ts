import { BUDGET_TYPES, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Get budget spending stats', () => {
  describe('Manual budget', () => {
    it('returns spending stats for a manual budget with transactions', async () => {
      const account = await helpers.createAccount({ raw: true });

      const category1 = await helpers.addCustomCategory({
        name: 'Food',
        color: '#FF0000',
        raw: true,
      });
      const category2 = await helpers.addCustomCategory({
        name: 'Transport',
        color: '#00FF00',
        raw: true,
      });

      // Create expense transactions with different categories (amounts are decimals)
      const [tx1] = await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 500,
          categoryId: category1.id,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-03-15T10:00:00Z',
        }),
      });
      const [tx2] = await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 300,
          categoryId: category2.id,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-03-20T10:00:00Z',
        }),
      });
      const [tx3] = await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 200,
          categoryId: category1.id,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-03-25T10:00:00Z',
        }),
      });

      // Create an income transaction
      const [tx4] = await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 1000,
          categoryId: category1.id,
          transactionType: TRANSACTION_TYPES.income,
          time: '2025-03-10T10:00:00Z',
        }),
      });

      const budget = await helpers.createCustomBudget({
        name: 'test-spending-stats',
        startDate: '2025-03-01T00:00:00Z',
        endDate: '2025-03-31T23:59:59Z',
        raw: true,
      });

      await helpers.addTransactionToCustomBudget({
        id: budget.id,
        payload: { transactionIds: [tx1.id, tx2.id, tx3.id, tx4.id] },
      });

      const result = await helpers.getSpendingStats({ id: budget.id, raw: true });

      // Verify spendingsByCategory - expenses only, grouped by root category
      expect(result.spendingsByCategory).toHaveLength(2);

      // Sorted by amount descending: Food (500+200=700), Transport (300)
      expect(result.spendingsByCategory[0]!.categoryId).toBe(category1.id);
      expect(result.spendingsByCategory[0]!.name).toBe('Food');
      expect(result.spendingsByCategory[0]!.amount).toBe(700);
      expect(result.spendingsByCategory[1]!.categoryId).toBe(category2.id);
      expect(result.spendingsByCategory[1]!.name).toBe('Transport');
      expect(result.spendingsByCategory[1]!.amount).toBe(300);

      // Verify spendingOverTime
      // 31 days → weekly granularity
      expect(result.spendingOverTime.granularity).toBe('weekly');
      expect(result.spendingOverTime.periods.length).toBeGreaterThan(0);

      // Sum of all period expenses should equal total expenses
      const totalExpense = result.spendingOverTime.periods.reduce((sum, p) => sum + p.expense, 0);
      expect(totalExpense).toBe(1000);

      // Sum of all period income should equal total income
      const totalIncome = result.spendingOverTime.periods.reduce((sum, p) => sum + p.income, 0);
      expect(totalIncome).toBe(1000);
    });

    it('returns empty stats for an empty manual budget', async () => {
      const budget = await helpers.createCustomBudget({
        name: 'empty-budget',
        startDate: '2025-03-01T00:00:00Z',
        endDate: '2025-03-31T23:59:59Z',
        raw: true,
      });

      const result = await helpers.getSpendingStats({ id: budget.id, raw: true });

      expect(result.spendingsByCategory).toEqual([]);
      expect(result.spendingOverTime.periods).toEqual([]);
    });

    it('returns subcategory breakdown for transactions under child categories', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Parent category
      const parentCategory = await helpers.addCustomCategory({
        name: 'Food',
        color: '#FF0000',
        raw: true,
      });
      // Child categories
      const childCategory1 = await helpers.addCustomCategory({
        name: 'Groceries',
        color: '#FF5555',
        parentId: parentCategory.id,
        raw: true,
      });
      const childCategory2 = await helpers.addCustomCategory({
        name: 'Dining Out',
        color: '#FF9999',
        parentId: parentCategory.id,
        raw: true,
      });
      // A separate root category (no children)
      const transportCategory = await helpers.addCustomCategory({
        name: 'Transport',
        color: '#00FF00',
        raw: true,
      });

      // Create expenses under child categories
      const [tx1] = await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 400,
          categoryId: childCategory1.id,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-03-10T10:00:00Z',
        }),
      });
      const [tx2] = await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 250,
          categoryId: childCategory2.id,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-03-15T10:00:00Z',
        }),
      });
      // Expense directly under parent category (no child)
      const [tx3] = await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          categoryId: parentCategory.id,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-03-20T10:00:00Z',
        }),
      });
      // Expense under separate root category
      const [tx4] = await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 300,
          categoryId: transportCategory.id,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-03-12T10:00:00Z',
        }),
      });

      const budget = await helpers.createCustomBudget({
        name: 'subcategory-test',
        startDate: '2025-03-01T00:00:00Z',
        endDate: '2025-03-31T23:59:59Z',
        raw: true,
      });

      await helpers.addTransactionToCustomBudget({
        id: budget.id,
        payload: { transactionIds: [tx1.id, tx2.id, tx3.id, tx4.id] },
      });

      const result = await helpers.getSpendingStats({ id: budget.id, raw: true });

      // Food (400+250+100=750) > Transport (300)
      expect(result.spendingsByCategory).toHaveLength(2);
      expect(result.spendingsByCategory[0]!.categoryId).toBe(parentCategory.id);
      expect(result.spendingsByCategory[0]!.name).toBe('Food');
      expect(result.spendingsByCategory[0]!.amount).toBe(750);

      // Food should have children (only subcategory transactions, not the direct parent one)
      const foodChildren = result.spendingsByCategory[0]!.children;
      expect(foodChildren).toBeDefined();
      expect(foodChildren).toHaveLength(2);
      // Sorted by amount descending: Groceries (400), Dining Out (250)
      expect(foodChildren![0]!.categoryId).toBe(childCategory1.id);
      expect(foodChildren![0]!.name).toBe('Groceries');
      expect(foodChildren![0]!.amount).toBe(400);
      expect(foodChildren![1]!.categoryId).toBe(childCategory2.id);
      expect(foodChildren![1]!.name).toBe('Dining Out');
      expect(foodChildren![1]!.amount).toBe(250);

      // Transport has no children
      expect(result.spendingsByCategory[1]!.categoryId).toBe(transportCategory.id);
      expect(result.spendingsByCategory[1]!.amount).toBe(300);
      expect(result.spendingsByCategory[1]!.children).toBeUndefined();
    });

    it('uses transaction date range when budget has no dates', async () => {
      const account = await helpers.createAccount({ raw: true });
      const category = await helpers.addCustomCategory({
        name: 'Misc',
        color: '#AAAAAA',
        raw: true,
      });

      const [tx1] = await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 500,
          categoryId: category.id,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-06-01T10:00:00Z',
        }),
      });
      const [tx2] = await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 300,
          categoryId: category.id,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-06-15T10:00:00Z',
        }),
      });

      // Budget without dates
      const budget = await helpers.createCustomBudget({
        name: 'no-date-budget',
        startDate: null,
        endDate: null,
        raw: true,
      });

      await helpers.addTransactionToCustomBudget({
        id: budget.id,
        payload: { transactionIds: [tx1.id, tx2.id] },
      });

      const result = await helpers.getSpendingStats({ id: budget.id, raw: true });

      expect(result.spendingsByCategory).toHaveLength(1);
      expect(result.spendingOverTime.periods.length).toBeGreaterThan(0);
      // 14 days → weekly
      expect(result.spendingOverTime.granularity).toBe('weekly');
    });
  });

  describe('Category budget', () => {
    it('returns spending stats for a category budget', async () => {
      const account = await helpers.createAccount({ raw: true });

      const category1 = await helpers.addCustomCategory({
        name: 'Groceries',
        color: '#FF0000',
        raw: true,
      });
      const category2 = await helpers.addCustomCategory({
        name: 'Dining',
        color: '#00FF00',
        raw: true,
      });

      // Create transactions matching the budget categories
      await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 800,
          categoryId: category1.id,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-04-10T10:00:00Z',
        }),
      });
      await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 400,
          categoryId: category2.id,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-04-15T10:00:00Z',
        }),
      });

      const budget = await helpers.createCustomBudget({
        name: 'food-category-budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category1.id, category2.id],
        startDate: '2025-04-01T00:00:00Z',
        endDate: '2025-04-30T23:59:59Z',
        limitAmount: 2000,
        raw: true,
      });

      const result = await helpers.getSpendingStats({ id: budget.id, raw: true });

      expect(result.spendingsByCategory).toHaveLength(2);
      // Sorted by amount desc: Groceries (800), Dining (400)
      expect(result.spendingsByCategory[0]!.name).toBe('Groceries');
      expect(result.spendingsByCategory[0]!.amount).toBe(800);
      expect(result.spendingsByCategory[1]!.name).toBe('Dining');
      expect(result.spendingsByCategory[1]!.amount).toBe(400);

      // 30 days → weekly
      expect(result.spendingOverTime.granularity).toBe('weekly');
      expect(result.spendingOverTime.periods.length).toBeGreaterThan(0);
    });

    it('returns empty stats when category budget has no matching transactions', async () => {
      const category = await helpers.addCustomCategory({
        name: 'EmptyCategory',
        color: '#999999',
        raw: true,
      });

      const budget = await helpers.createCustomBudget({
        name: 'empty-category-budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        startDate: '2025-04-01T00:00:00Z',
        endDate: '2025-04-30T23:59:59Z',
        raw: true,
      });

      const result = await helpers.getSpendingStats({ id: budget.id, raw: true });

      expect(result.spendingsByCategory).toEqual([]);
      expect(result.spendingOverTime.periods).toEqual([]);
    });

    it('returns subcategory breakdown for category budget with child categories', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Parent category (budget target)
      const parentCategory = await helpers.addCustomCategory({
        name: 'Food',
        color: '#FF0000',
        raw: true,
      });
      // Child categories
      const childCategory1 = await helpers.addCustomCategory({
        name: 'Groceries',
        color: '#FF5555',
        parentId: parentCategory.id,
        raw: true,
      });
      const childCategory2 = await helpers.addCustomCategory({
        name: 'Dining Out',
        color: '#FF9999',
        parentId: parentCategory.id,
        raw: true,
      });

      // Expenses under child categories
      await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 600,
          categoryId: childCategory1.id,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-04-10T10:00:00Z',
        }),
      });
      await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 350,
          categoryId: childCategory2.id,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-04-15T10:00:00Z',
        }),
      });

      // Budget tracks the parent category (descendants auto-included)
      const budget = await helpers.createCustomBudget({
        name: 'food-subcategory-budget',
        type: BUDGET_TYPES.category,
        categoryIds: [parentCategory.id],
        startDate: '2025-04-01T00:00:00Z',
        endDate: '2025-04-30T23:59:59Z',
        raw: true,
      });

      const result = await helpers.getSpendingStats({ id: budget.id, raw: true });

      expect(result.spendingsByCategory).toHaveLength(1);
      expect(result.spendingsByCategory[0]!.categoryId).toBe(parentCategory.id);
      expect(result.spendingsByCategory[0]!.amount).toBe(950);

      const children = result.spendingsByCategory[0]!.children;
      expect(children).toBeDefined();
      expect(children).toHaveLength(2);
      expect(children![0]!.categoryId).toBe(childCategory1.id);
      expect(children![0]!.name).toBe('Groceries');
      expect(children![0]!.amount).toBe(600);
      expect(children![1]!.categoryId).toBe(childCategory2.id);
      expect(children![1]!.name).toBe('Dining Out');
      expect(children![1]!.amount).toBe(350);
    });

    it('handles split transactions correctly for category budget', async () => {
      const account = await helpers.createAccount({ raw: true });

      const category1 = await helpers.addCustomCategory({
        name: 'SplitCat1',
        color: '#FF0000',
        raw: true,
      });
      const category2 = await helpers.addCustomCategory({
        name: 'SplitCat2',
        color: '#00FF00',
        raw: true,
      });

      // Create a transaction with splits where only one split matches budget category
      await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 1000, // $10.00 total
          categoryId: category1.id,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-05-10T10:00:00Z',
          splits: [
            { categoryId: category1.id, amount: 600 }, // $6.00
            { categoryId: category2.id, amount: 400 }, // $4.00
          ],
        }),
      });

      // Budget only tracks category1
      const budget = await helpers.createCustomBudget({
        name: 'split-budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category1.id],
        startDate: '2025-05-01T00:00:00Z',
        endDate: '2025-05-31T23:59:59Z',
        raw: true,
      });

      const result = await helpers.getSpendingStats({ id: budget.id, raw: true });

      // Should only count the split amount for category1 (600)
      expect(result.spendingsByCategory).toHaveLength(1);
      expect(result.spendingsByCategory[0]!.name).toBe('SplitCat1');
      expect(result.spendingsByCategory[0]!.amount).toBe(600);
    });
  });

  describe('Error handling', () => {
    it('returns 404 for non-existent budget', async () => {
      const response = await helpers.getSpendingStats({ id: 999999, raw: false });
      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('returns validation error for invalid budget id', async () => {
      const response = await helpers.getSpendingStats({
        id: 'invalid' as unknown as number,
        raw: false,
      });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });
});
