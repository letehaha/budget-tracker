import { BUDGET_TYPES, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

/**
 * Category budgets must skip accounts flagged `excludeFromStats`, the same way the
 * global stats surfaces do (`getBudgetStats`, `getBudgetSpendingStats`,
 * `getCategoryBudgetTransactions`). Manual budgets are explicit user selections, so
 * the flag does NOT apply to them — attached rows count regardless of account.
 */
describe('Category budget excludes accounts marked excludeFromStats', () => {
  const INCLUDED_TX_TIME = '2025-03-10T10:00:00Z';

  const seedCategoryBudgetWithExcludedAccount = async () => {
    const category = await helpers.addCustomCategory({ name: 'Groceries', color: '#FF0000', raw: true });

    const includedAccount = await helpers.createAccount({ raw: true });
    const excludedAccount = await helpers.createAccount({ raw: true });
    await helpers.updateAccount({ id: excludedAccount.id, payload: { excludeFromStats: true }, raw: true });

    const [includedTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: includedAccount.id,
        amount: 100,
        transactionType: TRANSACTION_TYPES.expense,
        categoryId: category.id,
        time: INCLUDED_TX_TIME,
      }),
      raw: true,
    });

    const [excludedTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: excludedAccount.id,
        amount: 400,
        transactionType: TRANSACTION_TYPES.expense,
        categoryId: category.id,
        time: '2025-03-11T10:00:00Z',
      }),
      raw: true,
    });

    const budget = await helpers.createCustomBudget({
      name: 'Groceries Budget',
      type: BUDGET_TYPES.category,
      categoryIds: [category.id],
      startDate: '2025-03-01T00:00:00Z',
      endDate: '2025-03-31T23:59:59Z',
      limitAmount: 500,
      raw: true,
    });

    return { budget, category, includedAccount, excludedAccount, includedTx, excludedTx };
  };

  it('omits excluded-account spend from budget stats', async () => {
    const { budget } = await seedCategoryBudgetWithExcludedAccount();

    const stats = (await helpers.getStats({ id: budget.id, raw: true }))!;

    expect(stats.summary.actualExpense).toBe(100);
    expect(stats.summary.actualIncome).toBe(0);
    expect(stats.summary.balance).toBe(-100);
    expect(stats.summary.transactionsCount).toBe(1);
    expect(stats.summary.utilizationRate).toBeCloseTo((100 / 500) * 100, 1);
    expect(new Date(stats.summary.lastTransactionDate!).toISOString()).toBe(new Date(INCLUDED_TX_TIME).toISOString());
  });

  it('omits excluded-account spend from the spending breakdown', async () => {
    const { budget, category } = await seedCategoryBudgetWithExcludedAccount();

    const result = await helpers.getSpendingStats({ id: budget.id, raw: true });

    expect(result.spendingsByCategory).toHaveLength(1);
    expect(result.spendingsByCategory[0]!.categoryId).toBe(category.id);
    expect(result.spendingsByCategory[0]!.amount).toBe(100);

    const totalExpense = result.spendingOverTime.periods.reduce((sum, period) => sum + period.expense, 0);
    expect(totalExpense).toBe(100);
  });

  it('omits excluded-account transactions from the budget transaction list', async () => {
    const { budget, includedAccount, excludedAccount } = await seedCategoryBudgetWithExcludedAccount();

    const result = await helpers.getCategoryBudgetTransactions({ id: budget.id, raw: true });

    expect(result.total).toBe(1);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]!.accountId).toBe(includedAccount.id);
    expect(result.transactions[0]!.refAmount).toBe(100);
    expect(result.transactions.map((tx) => tx.accountId)).not.toContain(excludedAccount.id);
  });
});

describe('Manual budget includes accounts marked excludeFromStats', () => {
  const EXCLUDED_TX_TIME = '2025-03-11T10:00:00Z';

  const seedManualBudgetWithExcludedAccount = async () => {
    const category = await helpers.addCustomCategory({ name: 'Groceries', color: '#FF0000', raw: true });

    const includedAccount = await helpers.createAccount({ raw: true });
    const excludedAccount = await helpers.createAccount({ raw: true });
    await helpers.updateAccount({ id: excludedAccount.id, payload: { excludeFromStats: true }, raw: true });

    const [includedTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: includedAccount.id,
        amount: 100,
        transactionType: TRANSACTION_TYPES.expense,
        categoryId: category.id,
        time: '2025-03-10T10:00:00Z',
      }),
      raw: true,
    });

    const [excludedTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: excludedAccount.id,
        amount: 400,
        transactionType: TRANSACTION_TYPES.expense,
        categoryId: category.id,
        time: EXCLUDED_TX_TIME,
      }),
      raw: true,
    });

    const budget = await helpers.createCustomBudget({
      name: 'Manual Groceries Budget',
      type: BUDGET_TYPES.manual,
      startDate: '2025-03-01T00:00:00Z',
      endDate: '2025-03-31T23:59:59Z',
      limitAmount: 500,
      raw: true,
    });

    await helpers.addTransactionToCustomBudget({
      id: budget.id,
      payload: { transactionIds: [includedTx!.id, excludedTx!.id] },
      raw: true,
    });

    return { budget, category, includedAccount, excludedAccount, includedTx, excludedTx };
  };

  it('counts excluded-account spend in manual budget stats', async () => {
    const { budget } = await seedManualBudgetWithExcludedAccount();

    const stats = (await helpers.getStats({ id: budget.id, raw: true }))!;

    expect(stats.summary.actualExpense).toBe(500);
    expect(stats.summary.actualIncome).toBe(0);
    expect(stats.summary.balance).toBe(-500);
    expect(stats.summary.transactionsCount).toBe(2);
    expect(stats.summary.utilizationRate).toBeCloseTo((500 / 500) * 100, 1);
    expect(new Date(stats.summary.lastTransactionDate!).toISOString()).toBe(new Date(EXCLUDED_TX_TIME).toISOString());
  });

  it('counts excluded-account spend in the manual spending breakdown', async () => {
    const { budget, category } = await seedManualBudgetWithExcludedAccount();

    const result = await helpers.getSpendingStats({ id: budget.id, raw: true });

    expect(result.spendingsByCategory).toHaveLength(1);
    expect(result.spendingsByCategory[0]!.categoryId).toBe(category.id);
    expect(result.spendingsByCategory[0]!.amount).toBe(500);

    const totalExpense = result.spendingOverTime.periods.reduce((sum, period) => sum + period.expense, 0);
    expect(totalExpense).toBe(500);
  });
});
