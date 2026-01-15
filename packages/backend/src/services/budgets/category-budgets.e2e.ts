import { BUDGET_TYPES, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

import { getResponseInitialState } from './stats';

/**
 * E2E tests for Category-Based Budgets
 *
 * These tests verify the complete flow of category-based budgets including:
 * - Creation with categories
 * - Editing and category assignment/unassignment
 * - Stats calculation based on transaction categories
 * - Split transaction handling
 * - Edge cases
 */
describe('Category-Based Budgets', () => {
  describe('Budget Creation', () => {
    it('successfully creates a category budget with single category', async () => {
      // Create a category
      const category = await helpers.addCustomCategory({
        name: 'Food',
        color: '#FF0000',
        raw: true,
      });

      // Create category budget
      const budget = await helpers.createCustomBudget({
        name: 'Food Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        limitAmount: 500,
        raw: true,
      });

      expect(budget.type).toBe(BUDGET_TYPES.category);
      expect(budget.categories).toHaveLength(1);
      expect(budget.categories![0]!.id).toBe(category.id);
      expect(budget.limitAmount).toBe(500);
    });

    it('successfully creates a category budget with multiple categories', async () => {
      const category1 = await helpers.addCustomCategory({
        name: 'Restaurants',
        color: '#FF0000',
        raw: true,
      });
      const category2 = await helpers.addCustomCategory({
        name: 'Cafes',
        color: '#00FF00',
        raw: true,
      });
      const category3 = await helpers.addCustomCategory({
        name: 'Bars',
        color: '#0000FF',
        raw: true,
      });

      const budget = await helpers.createCustomBudget({
        name: 'Eating Out Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category1.id, category2.id, category3.id],
        limitAmount: 1000,
        raw: true,
      });

      expect(budget.type).toBe(BUDGET_TYPES.category);
      expect(budget.categories).toHaveLength(3);
      const categoryIds = budget.categories.map((c) => c.id);
      expect(categoryIds).toContain(category1.id);
      expect(categoryIds).toContain(category2.id);
      expect(categoryIds).toContain(category3.id);
    });

    it('successfully creates a category budget with parent category (auto-includes children)', async () => {
      // Create parent category
      const parentCategory = await helpers.addCustomCategory({
        name: 'Entertainment',
        color: '#FF0000',
        raw: true,
      });

      // Create child categories
      const child1 = await helpers.addCustomCategory({
        name: 'Movies',
        color: '#00FF00',
        parentId: parentCategory.id,
        raw: true,
      });
      const child2 = await helpers.addCustomCategory({
        name: 'Games',
        color: '#0000FF',
        parentId: parentCategory.id,
        raw: true,
      });

      // Create budget with parent only - children should be auto-included
      const budget = await helpers.createCustomBudget({
        name: 'Entertainment Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [parentCategory.id],
        raw: true,
      });

      expect(budget.type).toBe(BUDGET_TYPES.category);
      // Should have parent + 2 children
      expect(budget.categories).toHaveLength(3);
      const categoryIds = budget.categories.map((c) => c.id);
      expect(categoryIds).toContain(parentCategory.id);
      expect(categoryIds).toContain(child1.id);
      expect(categoryIds).toContain(child2.id);
    });

    it('fails to create category budget without categories', async () => {
      const response = await helpers.createCustomBudget({
        name: 'Invalid Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [],
        raw: false,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('fails to create category budget with non-existent category', async () => {
      const response = await helpers.createCustomBudget({
        name: 'Invalid Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [999999],
        raw: false,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('successfully creates manual budget (default type)', async () => {
      const budget = await helpers.createCustomBudget({
        name: 'Manual Budget',
        limitAmount: 1000,
        raw: true,
      });

      expect(budget.type).toBe(BUDGET_TYPES.manual);
      expect(budget.categories).toHaveLength(0);
    });

    it('successfully creates manual budget with explicit type', async () => {
      const budget = await helpers.createCustomBudget({
        name: 'Manual Budget Explicit',
        type: BUDGET_TYPES.manual,
        limitAmount: 1000,
        raw: true,
      });

      expect(budget.type).toBe(BUDGET_TYPES.manual);
      expect(budget.categories).toHaveLength(0);
    });
  });

  describe('Budget Editing', () => {
    it('successfully updates category budget categories', async () => {
      const category1 = await helpers.addCustomCategory({ name: 'Cat1', color: '#FF0000', raw: true });
      const category2 = await helpers.addCustomCategory({ name: 'Cat2', color: '#00FF00', raw: true });

      // Create budget with one category
      const budget = await helpers.createCustomBudget({
        name: 'Test Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category1.id],
        raw: true,
      });

      expect(budget.categories).toHaveLength(1);

      // Update to include both categories
      const updatedBudget = await helpers.editCustomBudget({
        id: budget.id,
        params: { categoryIds: [category1.id, category2.id] },
        raw: true,
      });

      expect(updatedBudget.categories).toHaveLength(2);
    });

    it('successfully removes categories from budget', async () => {
      const category1 = await helpers.addCustomCategory({ name: 'Cat1', color: '#FF0000', raw: true });
      const category2 = await helpers.addCustomCategory({ name: 'Cat2', color: '#00FF00', raw: true });

      const budget = await helpers.createCustomBudget({
        name: 'Test Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category1.id, category2.id],
        raw: true,
      });

      expect(budget.categories).toHaveLength(2);

      // Remove one category
      const updatedBudget = await helpers.editCustomBudget({
        id: budget.id,
        params: { categoryIds: [category1.id] },
        raw: true,
      });

      expect(updatedBudget.categories).toHaveLength(1);
      expect(updatedBudget.categories![0]!.id).toBe(category1.id);
    });

    it('successfully updates budget name without affecting categories', async () => {
      const category = await helpers.addCustomCategory({ name: 'Cat1', color: '#FF0000', raw: true });

      const budget = await helpers.createCustomBudget({
        name: 'Original Name',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        raw: true,
      });

      const updatedBudget = await helpers.editCustomBudget({
        id: budget.id,
        params: { name: 'New Name' },
        raw: true,
      });

      expect(updatedBudget.name).toBe('New Name');
      expect(updatedBudget.categories).toHaveLength(1);
      expect(updatedBudget.categories![0]!.id).toBe(category.id);
    });
  });

  describe('Stats Calculation - Basic', () => {
    it('correctly calculates stats for transactions matching category', async () => {
      const category = await helpers.addCustomCategory({ name: 'Groceries', color: '#FF0000', raw: true });

      // Create category budget
      const budget = await helpers.createCustomBudget({
        name: 'Grocery Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        limitAmount: 500,
        raw: true,
      });

      // Create expense transaction with matching category
      const account = await helpers.createAccount({ raw: true });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
        }),
        raw: true,
      });

      // Create another expense
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 50,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
        }),
        raw: true,
      });

      const stats = await helpers.getStats({ id: budget.id, raw: true });

      expect(stats!.summary.actualExpense).toBe(150);
      expect(stats!.summary.actualIncome).toBe(0);
      expect(stats!.summary.balance).toBe(-150);
      expect(stats!.summary.utilizationRate).toBeCloseTo((150 / 500) * 100, 1);
      expect(stats!.summary.transactionsCount).toBe(2);
    });

    it('does not count transactions with non-matching categories', async () => {
      const category1 = await helpers.addCustomCategory({ name: 'Groceries', color: '#FF0000', raw: true });
      const category2 = await helpers.addCustomCategory({ name: 'Transport', color: '#00FF00', raw: true });

      // Budget only tracks category1
      const budget = await helpers.createCustomBudget({
        name: 'Grocery Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category1.id],
        limitAmount: 500,
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      // Transaction with matching category
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category1.id,
        }),
        raw: true,
      });

      // Transaction with non-matching category
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 200,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category2.id,
        }),
        raw: true,
      });

      const stats = await helpers.getStats({ id: budget.id, raw: true });

      // Should only count the transaction with category1
      expect(stats!.summary.actualExpense).toBe(100);
      expect(stats!.summary.transactionsCount).toBe(1);
    });

    it('counts both income and expense transactions', async () => {
      const category = await helpers.addCustomCategory({ name: 'Freelance', color: '#FF0000', raw: true });

      const budget = await helpers.createCustomBudget({
        name: 'Freelance Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      // Income transaction
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 500,
          transactionType: TRANSACTION_TYPES.income,
          categoryId: category.id,
        }),
        raw: true,
      });

      // Expense transaction
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
        }),
        raw: true,
      });

      const stats = await helpers.getStats({ id: budget.id, raw: true });

      expect(stats!.summary.actualIncome).toBe(500);
      expect(stats!.summary.actualExpense).toBe(100);
      expect(stats!.summary.balance).toBe(400);
      expect(stats!.summary.transactionsCount).toBe(2);
    });

    it('tracks transactions with child categories when parent is in budget', async () => {
      const parentCategory = await helpers.addCustomCategory({ name: 'Food', color: '#FF0000', raw: true });
      const childCategory = await helpers.addCustomCategory({
        name: 'Restaurants',
        color: '#00FF00',
        parentId: parentCategory.id,
        raw: true,
      });

      // Budget includes parent (which auto-includes children)
      const budget = await helpers.createCustomBudget({
        name: 'Food Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [parentCategory.id],
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      // Transaction with child category
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 50,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: childCategory.id,
        }),
        raw: true,
      });

      // Transaction with parent category
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 30,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: parentCategory.id,
        }),
        raw: true,
      });

      const stats = await helpers.getStats({ id: budget.id, raw: true });

      // Should count both parent and child category transactions
      expect(stats!.summary.actualExpense).toBe(80);
      expect(stats!.summary.transactionsCount).toBe(2);
    });
  });

  describe('Stats Calculation - Split Transactions', () => {
    it('counts only the split amount for matching category', async () => {
      const category1 = await helpers.addCustomCategory({ name: 'Groceries', color: '#FF0000', raw: true });
      const category2 = await helpers.addCustomCategory({ name: 'Household', color: '#00FF00', raw: true });

      // Budget only tracks category1
      const budget = await helpers.createCustomBudget({
        name: 'Grocery Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category1.id],
        limitAmount: 500,
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      // Create transaction with splits
      // Total: 100, split: 60 for Groceries, 40 for Household
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category1.id,
          splits: [
            { amount: 60, categoryId: category1.id },
            { amount: 40, categoryId: category2.id },
          ],
        }),
        raw: true,
      });

      const stats = await helpers.getStats({ id: budget.id, raw: true });

      // Should only count the 60 from the groceries split
      expect(stats!.summary.actualExpense).toBe(60);
      expect(stats!.summary.transactionsCount).toBe(1);
    });

    it('counts multiple splits from same transaction that match category', async () => {
      const category1 = await helpers.addCustomCategory({ name: 'Groceries', color: '#FF0000', raw: true });
      const category2 = await helpers.addCustomCategory({ name: 'Household', color: '#00FF00', raw: true });

      // Budget tracks both categories
      const budget = await helpers.createCustomBudget({
        name: 'Shopping Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category1.id, category2.id],
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      // Create transaction with splits (all categories in budget)
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category1.id,
          splits: [
            { amount: 60, categoryId: category1.id },
            { amount: 40, categoryId: category2.id },
          ],
        }),
        raw: true,
      });

      const stats = await helpers.getStats({ id: budget.id, raw: true });

      // Should count both splits (60 + 40 = 100)
      expect(stats!.summary.actualExpense).toBe(100);
    });

    it('handles split transaction where only some splits match budget categories', async () => {
      const category1 = await helpers.addCustomCategory({ name: 'Food', color: '#FF0000', raw: true });
      const category2 = await helpers.addCustomCategory({ name: 'Transport', color: '#00FF00', raw: true });
      const category3 = await helpers.addCustomCategory({ name: 'Entertainment', color: '#0000FF', raw: true });

      // Budget only tracks Food and Transport
      const budget = await helpers.createCustomBudget({
        name: 'Essential Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category1.id, category2.id],
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      // Transaction split across 3 categories, only 2 in budget
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 150,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category1.id,
          splits: [
            { amount: 50, categoryId: category1.id }, // In budget
            { amount: 30, categoryId: category2.id }, // In budget
            { amount: 70, categoryId: category3.id }, // NOT in budget
          ],
        }),
        raw: true,
      });

      const stats = await helpers.getStats({ id: budget.id, raw: true });

      // Should only count 50 + 30 = 80
      expect(stats!.summary.actualExpense).toBe(80);
    });
  });

  describe('Stats Calculation - Date Boundary Edge Cases', () => {
    it('respects budget with only startDate (no endDate)', async () => {
      const category = await helpers.addCustomCategory({ name: 'Test', color: '#FF0000', raw: true });

      // Budget with only startDate
      const budget = await helpers.createCustomBudget({
        name: 'Start Only Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        startDate: '2025-03-01T00:00:00Z',
        endDate: null,
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      // Transaction before startDate - should NOT be counted
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
          time: '2025-02-15T12:00:00Z',
        }),
        raw: true,
      });

      // Transaction on startDate - should be counted
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 200,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
          time: '2025-03-01T00:00:00Z',
        }),
        raw: true,
      });

      // Transaction after startDate - should be counted
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 300,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
          time: '2025-06-15T12:00:00Z',
        }),
        raw: true,
      });

      const stats = await helpers.getStats({ id: budget.id, raw: true });

      // Should count transactions from startDate onwards (200 + 300)
      expect(stats!.summary.actualExpense).toBe(500);
      expect(stats!.summary.transactionsCount).toBe(2);
    });

    it('respects budget with only endDate (no startDate)', async () => {
      const category = await helpers.addCustomCategory({ name: 'Test', color: '#FF0000', raw: true });

      // Budget with only endDate
      const budget = await helpers.createCustomBudget({
        name: 'End Only Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        startDate: null,
        endDate: '2025-03-31T23:59:59Z',
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      // Transaction before endDate - should be counted
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
          time: '2025-01-15T12:00:00Z',
        }),
        raw: true,
      });

      // Transaction on endDate - should be counted
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 200,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
          time: '2025-03-31T23:59:59Z',
        }),
        raw: true,
      });

      // Transaction after endDate - should NOT be counted
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 300,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
          time: '2025-04-15T12:00:00Z',
        }),
        raw: true,
      });

      const stats = await helpers.getStats({ id: budget.id, raw: true });

      // Should count transactions up to endDate (100 + 200)
      expect(stats!.summary.actualExpense).toBe(300);
      expect(stats!.summary.transactionsCount).toBe(2);
    });
  });

  describe('Stats Calculation - Date Range', () => {
    it('respects budget date range when calculating stats', async () => {
      const category = await helpers.addCustomCategory({ name: 'Test', color: '#FF0000', raw: true });

      // Budget with specific date range
      const budget = await helpers.createCustomBudget({
        name: 'March Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        startDate: '2025-03-01T00:00:00Z',
        endDate: '2025-03-31T23:59:59Z',
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      // Transaction within date range
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
          time: '2025-03-15T12:00:00Z',
        }),
        raw: true,
      });

      // Transaction outside date range (February)
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 200,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
          time: '2025-02-15T12:00:00Z',
        }),
        raw: true,
      });

      // Transaction outside date range (April)
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 300,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
          time: '2025-04-15T12:00:00Z',
        }),
        raw: true,
      });

      const stats = await helpers.getStats({ id: budget.id, raw: true });

      // Should only count the March transaction
      expect(stats!.summary.actualExpense).toBe(100);
      expect(stats!.summary.transactionsCount).toBe(1);
    });

    it('counts all transactions when no date range specified', async () => {
      const category = await helpers.addCustomCategory({ name: 'Test', color: '#FF0000', raw: true });

      // Budget without date range
      const budget = await helpers.createCustomBudget({
        name: 'Open Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      // Multiple transactions at different dates
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
          time: '2025-01-15T12:00:00Z',
        }),
        raw: true,
      });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 200,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
          time: '2025-06-15T12:00:00Z',
        }),
        raw: true,
      });

      const stats = await helpers.getStats({ id: budget.id, raw: true });

      // Should count all transactions
      expect(stats!.summary.actualExpense).toBe(300);
      expect(stats!.summary.transactionsCount).toBe(2);
    });
  });

  describe('Category Budget vs Manual Budget Stats', () => {
    it('manual budget does not auto-track transactions by category', async () => {
      const category = await helpers.addCustomCategory({ name: 'Test', color: '#FF0000', raw: true });

      // Create manual budget
      const budget = await helpers.createCustomBudget({
        name: 'Manual Budget',
        type: BUDGET_TYPES.manual,
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      // Create transaction with category
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
        }),
        raw: true,
      });

      const stats = await helpers.getStats({ id: budget.id, raw: true });

      // Manual budget should NOT auto-count transactions by category
      expect(stats).toEqual(getResponseInitialState());
    });

    it('manual budget counts manually linked transactions', async () => {
      const category = await helpers.addCustomCategory({ name: 'Test', color: '#FF0000', raw: true });

      // Create manual budget
      const budget = await helpers.createCustomBudget({
        name: 'Manual Budget',
        type: BUDGET_TYPES.manual,
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      // Create transaction
      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
        }),
        raw: true,
      });

      // Manually link transaction to budget
      await helpers.addTransactionToCustomBudget({
        id: budget.id,
        payload: { transactionIds: [tx.id] },
        raw: true,
      });

      const stats = await helpers.getStats({ id: budget.id, raw: true });

      // Should now count the manually linked transaction
      expect(stats!.summary.actualExpense).toBe(100);
      expect(stats!.summary.transactionsCount).toBe(1);
    });

    it('category budget cannot have transactions manually linked', async () => {
      const category = await helpers.addCustomCategory({ name: 'Test', color: '#FF0000', raw: true });

      // Create category budget
      const budget = await helpers.createCustomBudget({
        name: 'Category Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      // Try to manually link transaction to category budget - should fail or be ignored
      const response = await helpers.addTransactionToCustomBudget({
        id: budget.id,
        payload: { transactionIds: [tx.id] },
        raw: false,
      });

      // Category budgets should reject manual transaction linking
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });

  describe('Edge Cases', () => {
    it('returns empty stats for category budget with no matching transactions', async () => {
      const category = await helpers.addCustomCategory({ name: 'Empty', color: '#FF0000', raw: true });

      const budget = await helpers.createCustomBudget({
        name: 'Empty Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        raw: true,
      });

      const stats = await helpers.getStats({ id: budget.id, raw: true });

      expect(stats).toEqual(getResponseInitialState());
    });

    it('handles category deletion gracefully', async () => {
      const category1 = await helpers.addCustomCategory({ name: 'Cat1', color: '#FF0000', raw: true });
      const category2 = await helpers.addCustomCategory({ name: 'Cat2', color: '#00FF00', raw: true });

      // Create budget with both categories
      const budget = await helpers.createCustomBudget({
        name: 'Test Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category1.id, category2.id],
        raw: true,
      });

      expect(budget.categories).toHaveLength(2);

      // Delete one category
      await helpers.deleteCustomCategory({ categoryId: category1.id, raw: true });

      // Fetch budget again
      const updatedBudget = await helpers.getCustomBudgetById({ id: budget.id, raw: true });

      // Should only have one category now
      expect(updatedBudget!.categories).toHaveLength(1);
      expect(updatedBudget!.categories![0]!.id).toBe(category2.id);
    });

    it('handles transaction category change', async () => {
      const category1 = await helpers.addCustomCategory({ name: 'Groceries', color: '#FF0000', raw: true });
      const category2 = await helpers.addCustomCategory({ name: 'Transport', color: '#00FF00', raw: true });

      // Budget only tracks category1
      const budget = await helpers.createCustomBudget({
        name: 'Grocery Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category1.id],
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      // Create transaction with category1
      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category1.id,
        }),
        raw: true,
      });

      // Verify transaction is counted
      let stats = await helpers.getStats({ id: budget.id, raw: true });
      expect(stats!.summary.actualExpense).toBe(100);

      // Change transaction category
      await helpers.updateTransaction({
        id: tx.id,
        payload: { categoryId: category2.id },
        raw: true,
      });

      // Verify transaction is no longer counted
      stats = await helpers.getStats({ id: budget.id, raw: true });
      expect(stats!.summary.actualExpense).toBe(0);
    });

    it('handles multiple budgets tracking same category', async () => {
      const category = await helpers.addCustomCategory({ name: 'Shared', color: '#FF0000', raw: true });

      // Create two budgets tracking the same category
      const budget1 = await helpers.createCustomBudget({
        name: 'Budget 1',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        limitAmount: 500,
        raw: true,
      });

      const budget2 = await helpers.createCustomBudget({
        name: 'Budget 2',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        limitAmount: 1000,
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
        }),
        raw: true,
      });

      // Both budgets should count the same transaction
      const stats1 = await helpers.getStats({ id: budget1.id, raw: true });
      const stats2 = await helpers.getStats({ id: budget2.id, raw: true });

      expect(stats1!.summary.actualExpense).toBe(100);
      expect(stats2!.summary.actualExpense).toBe(100);

      // But utilization rates should differ based on limits
      expect(stats1!.summary.utilizationRate).toBeCloseTo((100 / 500) * 100, 1);
      expect(stats2!.summary.utilizationRate).toBeCloseTo((100 / 1000) * 100, 1);
    });

    it('handles overlapping categories in budget (no double counting)', async () => {
      const parentCategory = await helpers.addCustomCategory({ name: 'Parent', color: '#FF0000', raw: true });
      const childCategory = await helpers.addCustomCategory({
        name: 'Child',
        color: '#00FF00',
        parentId: parentCategory.id,
        raw: true,
      });

      // Budget explicitly includes both parent and child
      const budget = await helpers.createCustomBudget({
        name: 'Test Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [parentCategory.id, childCategory.id],
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      // Transaction with child category
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: childCategory.id,
        }),
        raw: true,
      });

      const stats = await helpers.getStats({ id: budget.id, raw: true });

      // Should NOT double-count the transaction
      expect(stats!.summary.actualExpense).toBe(100);
      expect(stats!.summary.transactionsCount).toBe(1);
    });

    it('handles transaction deletion', async () => {
      const category = await helpers.addCustomCategory({ name: 'Test', color: '#FF0000', raw: true });

      const budget = await helpers.createCustomBudget({
        name: 'Test Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
        }),
        raw: true,
      });

      // Verify transaction is counted
      let stats = await helpers.getStats({ id: budget.id, raw: true });
      expect(stats!.summary.actualExpense).toBe(100);

      // Delete transaction
      await helpers.deleteTransaction({ id: tx.id });

      // Verify transaction is no longer counted
      stats = await helpers.getStats({ id: budget.id, raw: true });
      expect(stats!.summary.actualExpense).toBe(0);
    });

    it('handles budget deletion', async () => {
      const category = await helpers.addCustomCategory({ name: 'Test', color: '#FF0000', raw: true });

      const budget = await helpers.createCustomBudget({
        name: 'To Delete',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        raw: true,
      });

      // Delete budget
      await helpers.deleteCustomBudget({ id: budget.id, raw: true });

      // Verify budget no longer exists
      const response = await helpers.getCustomBudgetById({ id: budget.id, raw: false });
      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });

  describe('Listing and Filtering', () => {
    it('returns budgets with categories populated', async () => {
      const category = await helpers.addCustomCategory({ name: 'Test', color: '#FF0000', raw: true });

      await helpers.createCustomBudget({
        name: 'Category Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        raw: true,
      });

      await helpers.createCustomBudget({
        name: 'Manual Budget',
        type: BUDGET_TYPES.manual,
        raw: true,
      });

      const budgets = await helpers.getCustomBudgets({ raw: true });

      expect(budgets.length).toBe(2);

      const categoryBudget = budgets.find((b) => b.name === 'Category Budget');
      const manualBudget = budgets.find((b) => b.name === 'Manual Budget');

      expect(categoryBudget!.type).toBe(BUDGET_TYPES.category);
      expect(categoryBudget!.categories).toHaveLength(1);
      expect(categoryBudget!.categories![0]!.id).toBe(category.id);

      expect(manualBudget!.type).toBe(BUDGET_TYPES.manual);
      expect(manualBudget!.categories).toHaveLength(0);
    });
  });

  describe('Get Category Budget Transactions Endpoint', () => {
    it('returns transactions matching budget categories', async () => {
      const category = await helpers.addCustomCategory({ name: 'Food', color: '#FF0000', raw: true });

      const budget = await helpers.createCustomBudget({
        name: 'Food Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      // Create matching transaction
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
        }),
        raw: true,
      });

      const result = await helpers.getCategoryBudgetTransactions({ id: budget.id, raw: true });

      expect(result.total).toBe(1);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]!.effectiveCategory?.id).toBe(category.id);
      expect(result.transactions[0]!.effectiveCategory?.name).toBe('Food');
    });

    it('excludes transactions not matching budget categories', async () => {
      const category1 = await helpers.addCustomCategory({ name: 'Food', color: '#FF0000', raw: true });
      const category2 = await helpers.addCustomCategory({ name: 'Transport', color: '#00FF00', raw: true });

      // Budget only tracks Food
      const budget = await helpers.createCustomBudget({
        name: 'Food Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category1.id],
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      // Matching transaction
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category1.id,
        }),
        raw: true,
      });

      // Non-matching transaction
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 200,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category2.id,
        }),
        raw: true,
      });

      const result = await helpers.getCategoryBudgetTransactions({ id: budget.id, raw: true });

      expect(result.total).toBe(1);
      expect(result.transactions[0]!.effectiveCategory?.id).toBe(category1.id);
    });

    it('returns split transactions with only matching split amounts', async () => {
      const category1 = await helpers.addCustomCategory({ name: 'Groceries', color: '#FF0000', raw: true });
      const category2 = await helpers.addCustomCategory({ name: 'Household', color: '#00FF00', raw: true });

      // Budget only tracks Groceries
      const budget = await helpers.createCustomBudget({
        name: 'Grocery Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category1.id],
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      // Create split transaction
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category1.id,
          splits: [
            { amount: 60, categoryId: category1.id },
            { amount: 40, categoryId: category2.id },
          ],
        }),
        raw: true,
      });

      const result = await helpers.getCategoryBudgetTransactions({ id: budget.id, raw: true });

      // Should return only the Groceries split
      expect(result.total).toBe(1);
      expect(result.transactions[0]!.effectiveCategory?.id).toBe(category1.id);
      expect(result.transactions[0]!.effectiveRefAmount).toBe(60);
    });

    it('returns multiple split entries when multiple splits match budget categories', async () => {
      const category1 = await helpers.addCustomCategory({ name: 'Groceries', color: '#FF0000', raw: true });
      const category2 = await helpers.addCustomCategory({ name: 'Household', color: '#00FF00', raw: true });

      // Budget tracks both categories
      const budget = await helpers.createCustomBudget({
        name: 'Shopping Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category1.id, category2.id],
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category1.id,
          splits: [
            { amount: 60, categoryId: category1.id },
            { amount: 40, categoryId: category2.id },
          ],
        }),
        raw: true,
      });

      const result = await helpers.getCategoryBudgetTransactions({ id: budget.id, raw: true });

      // Should return both splits as separate entries
      expect(result.total).toBe(2);
      const amounts = result.transactions.map((t) => t.effectiveRefAmount);
      expect(amounts).toContain(60);
      expect(amounts).toContain(40);
    });

    it('respects budget date range', async () => {
      const category = await helpers.addCustomCategory({ name: 'Test', color: '#FF0000', raw: true });

      const budget = await helpers.createCustomBudget({
        name: 'March Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        startDate: '2025-03-01T00:00:00Z',
        endDate: '2025-03-31T23:59:59Z',
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      // Transaction within range
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
          time: '2025-03-15T12:00:00Z',
        }),
        raw: true,
      });

      // Transaction outside range
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 200,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
          time: '2025-04-15T12:00:00Z',
        }),
        raw: true,
      });

      const result = await helpers.getCategoryBudgetTransactions({ id: budget.id, raw: true });

      expect(result.total).toBe(1);
      expect(result.transactions[0]!.effectiveRefAmount).toBe(100);
    });

    it('supports pagination with from and limit', async () => {
      const category = await helpers.addCustomCategory({ name: 'Test', color: '#FF0000', raw: true });

      const budget = await helpers.createCustomBudget({
        name: 'Test Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      // Create 5 transactions
      for (let i = 1; i <= 5; i++) {
        await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: i * 10,
            transactionType: TRANSACTION_TYPES.expense,
            categoryId: category.id,
            time: `2025-03-0${i}T12:00:00Z`,
          }),
          raw: true,
        });
      }

      // Get first page
      const page1 = await helpers.getCategoryBudgetTransactions({ id: budget.id, from: 0, limit: 2, raw: true });
      expect(page1.total).toBe(5);
      expect(page1.transactions).toHaveLength(2);

      // Get second page
      const page2 = await helpers.getCategoryBudgetTransactions({ id: budget.id, from: 2, limit: 2, raw: true });
      expect(page2.total).toBe(5);
      expect(page2.transactions).toHaveLength(2);

      // Get last page
      const page3 = await helpers.getCategoryBudgetTransactions({ id: budget.id, from: 4, limit: 2, raw: true });
      expect(page3.total).toBe(5);
      expect(page3.transactions).toHaveLength(1);
    });

    it('returns empty array for budget with no matching transactions', async () => {
      const category = await helpers.addCustomCategory({ name: 'Empty', color: '#FF0000', raw: true });

      const budget = await helpers.createCustomBudget({
        name: 'Empty Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        raw: true,
      });

      const result = await helpers.getCategoryBudgetTransactions({ id: budget.id, raw: true });

      expect(result.total).toBe(0);
      expect(result.transactions).toHaveLength(0);
    });

    it('fails for manual budget', async () => {
      const budget = await helpers.createCustomBudget({
        name: 'Manual Budget',
        type: BUDGET_TYPES.manual,
        raw: true,
      });

      const response = await helpers.getCategoryBudgetTransactions({ id: budget.id, raw: false });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('fails for non-existent budget', async () => {
      const response = await helpers.getCategoryBudgetTransactions({ id: 999999, raw: false });

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('returns transactions sorted by date descending', async () => {
      const category = await helpers.addCustomCategory({ name: 'Test', color: '#FF0000', raw: true });

      const budget = await helpers.createCustomBudget({
        name: 'Test Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      // Create transactions in non-chronological order
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
          time: '2025-03-01T12:00:00Z',
        }),
        raw: true,
      });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 300,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
          time: '2025-03-15T12:00:00Z',
        }),
        raw: true,
      });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 200,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
          time: '2025-03-10T12:00:00Z',
        }),
        raw: true,
      });

      const result = await helpers.getCategoryBudgetTransactions({ id: budget.id, raw: true });

      expect(result.transactions).toHaveLength(3);
      // Should be sorted DESC: 300 (Mar 15), 200 (Mar 10), 100 (Mar 1)
      expect(result.transactions[0]!.effectiveRefAmount).toBe(300);
      expect(result.transactions[1]!.effectiveRefAmount).toBe(200);
      expect(result.transactions[2]!.effectiveRefAmount).toBe(100);
    });

    it('respects budget with only startDate', async () => {
      const category = await helpers.addCustomCategory({ name: 'Test', color: '#FF0000', raw: true });

      const budget = await helpers.createCustomBudget({
        name: 'Start Only Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        startDate: '2025-03-01T00:00:00Z',
        endDate: null,
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      // Transaction before startDate - should NOT be returned
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
          time: '2025-02-15T12:00:00Z',
        }),
        raw: true,
      });

      // Transaction after startDate - should be returned
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 200,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
          time: '2025-06-15T12:00:00Z',
        }),
        raw: true,
      });

      const result = await helpers.getCategoryBudgetTransactions({ id: budget.id, raw: true });

      expect(result.total).toBe(1);
      expect(result.transactions[0]!.effectiveRefAmount).toBe(200);
    });

    it('respects budget with only endDate', async () => {
      const category = await helpers.addCustomCategory({ name: 'Test', color: '#FF0000', raw: true });

      const budget = await helpers.createCustomBudget({
        name: 'End Only Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        startDate: null,
        endDate: '2025-03-31T23:59:59Z',
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      // Transaction before endDate - should be returned
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
          time: '2025-02-15T12:00:00Z',
        }),
        raw: true,
      });

      // Transaction after endDate - should NOT be returned
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 200,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
          time: '2025-04-15T12:00:00Z',
        }),
        raw: true,
      });

      const result = await helpers.getCategoryBudgetTransactions({ id: budget.id, raw: true });

      expect(result.total).toBe(1);
      expect(result.transactions[0]!.effectiveRefAmount).toBe(100);
    });
  });

  describe('AI Categorization Simulation', () => {
    /**
     * These tests simulate what happens after AI categorization assigns a category
     * to a transaction. Since AI categorization is an async background process,
     * we simulate its effect by creating transactions without a category and then
     * updating them to have a category (which is what AI categorization does).
     */

    it('budget stats update when uncategorized transaction gets AI-categorized', async () => {
      const category = await helpers.addCustomCategory({
        name: 'AI Target Category',
        color: '#FF0000',
        raw: true,
      });

      // Create category budget BEFORE transaction exists
      const budget = await helpers.createCustomBudget({
        name: 'AI Tracked Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        limitAmount: 1000,
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      // Simulate: Transaction created without category (like from bank sync)
      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 150,
          transactionType: TRANSACTION_TYPES.expense,
          // No categoryId - uncategorized
        }),
        raw: true,
      });

      // Verify budget doesn't count uncategorized transaction
      let stats = await helpers.getStats({ id: budget.id, raw: true });
      expect(stats!.summary.actualExpense).toBe(0);
      expect(stats!.summary.transactionsCount).toBe(0);

      // Simulate: AI categorization assigns the category
      await helpers.updateTransaction({
        id: tx.id,
        payload: { categoryId: category.id },
        raw: true,
      });

      // Verify budget now counts the transaction
      stats = await helpers.getStats({ id: budget.id, raw: true });
      expect(stats!.summary.actualExpense).toBe(150);
      expect(stats!.summary.transactionsCount).toBe(1);
      expect(stats!.summary.utilizationRate).toBeCloseTo((150 / 1000) * 100, 1);
    });

    it('handles AI re-categorization (category changed by AI)', async () => {
      const category1 = await helpers.addCustomCategory({ name: 'Groceries', color: '#FF0000', raw: true });
      const category2 = await helpers.addCustomCategory({ name: 'Restaurants', color: '#00FF00', raw: true });

      // Budget for Groceries
      const groceryBudget = await helpers.createCustomBudget({
        name: 'Grocery Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category1.id],
        raw: true,
      });

      // Budget for Restaurants
      const restaurantBudget = await helpers.createCustomBudget({
        name: 'Restaurant Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category2.id],
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      // Transaction initially categorized as Groceries by first AI pass
      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 50,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category1.id,
        }),
        raw: true,
      });

      // Verify counts in both budgets
      let groceryStats = await helpers.getStats({ id: groceryBudget.id, raw: true });
      let restaurantStats = await helpers.getStats({ id: restaurantBudget.id, raw: true });

      expect(groceryStats!.summary.actualExpense).toBe(50);
      expect(restaurantStats!.summary.actualExpense).toBe(0);

      // Simulate: User corrects or AI re-categorizes to Restaurants
      await helpers.updateTransaction({
        id: tx.id,
        payload: { categoryId: category2.id },
        raw: true,
      });

      // Verify counts updated correctly
      groceryStats = await helpers.getStats({ id: groceryBudget.id, raw: true });
      restaurantStats = await helpers.getStats({ id: restaurantBudget.id, raw: true });

      expect(groceryStats!.summary.actualExpense).toBe(0);
      expect(restaurantStats!.summary.actualExpense).toBe(50);
    });

    it('handles batch of transactions getting AI-categorized', async () => {
      const category = await helpers.addCustomCategory({
        name: 'Shopping',
        color: '#FF0000',
        raw: true,
      });

      const budget = await helpers.createCustomBudget({
        name: 'Shopping Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        limitAmount: 500,
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      // Create multiple uncategorized transactions (like from bank sync batch)
      const transactions = await Promise.all([
        helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 30,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        }),
        helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 45,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        }),
        helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 25,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        }),
      ]);

      // Initially no transactions counted
      let stats = await helpers.getStats({ id: budget.id, raw: true });
      expect(stats!.summary.actualExpense).toBe(0);

      // Simulate: AI batch categorization
      await Promise.all(
        transactions.map(([tx]) =>
          helpers.updateTransaction({
            id: tx.id,
            payload: { categoryId: category.id },
            raw: true,
          }),
        ),
      );

      // All transactions now counted
      stats = await helpers.getStats({ id: budget.id, raw: true });
      expect(stats!.summary.actualExpense).toBe(100); // 30 + 45 + 25
      expect(stats!.summary.transactionsCount).toBe(3);
    });

    it('handles AI categorization to child category when parent is in budget', async () => {
      const parentCategory = await helpers.addCustomCategory({
        name: 'Food',
        color: '#FF0000',
        raw: true,
      });
      const childCategory = await helpers.addCustomCategory({
        name: 'Fast Food',
        color: '#00FF00',
        parentId: parentCategory.id,
        raw: true,
      });

      // Budget tracks parent (which auto-includes children)
      const budget = await helpers.createCustomBudget({
        name: 'Food Budget',
        type: BUDGET_TYPES.category,
        categoryIds: [parentCategory.id],
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      // Uncategorized transaction
      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 15,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      // AI categorizes to child category
      await helpers.updateTransaction({
        id: tx.id,
        payload: { categoryId: childCategory.id },
        raw: true,
      });

      // Should be counted since child is part of parent's budget
      const stats = await helpers.getStats({ id: budget.id, raw: true });
      expect(stats!.summary.actualExpense).toBe(15);
      expect(stats!.summary.transactionsCount).toBe(1);
    });
  });
});
