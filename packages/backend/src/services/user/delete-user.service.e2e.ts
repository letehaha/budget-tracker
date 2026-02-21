import { TRANSACTION_TYPES } from '@bt/shared/types';
import { API_RESPONSE_STATUS } from '@bt/shared/types/api';
import { describe, expect, it } from '@jest/globals';
import Accounts from '@models/Accounts.model';
import Budgets from '@models/Budget.model';
import Categories from '@models/Categories.model';
import Transactions from '@models/Transactions.model';
import UserSettings from '@models/UserSettings.model';
import Users from '@models/Users.model';
import UsersCurrencies from '@models/UsersCurrencies.model';
import { connection } from '@models/index';
import Portfolios from '@models/investments/Portfolios.model';
import * as helpers from '@tests/helpers';

describe('User deletion (DELETE /user/delete)', () => {
  it('should delete user and all related data via CASCADE', async () => {
    // 1. Create account
    const account = await helpers.createAccount({ raw: true });

    // 2. Create custom category
    const category = await helpers.addCustomCategory({
      name: 'Test Category',
      color: '#FF0000',
      raw: true,
    });

    // 3. Create transaction
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 1000,
        transactionType: TRANSACTION_TYPES.expense,
        categoryId: category.id,
      }),
      raw: true,
    });

    // 4. Create account group and add account to it
    const group = await helpers.createAccountGroup({ name: 'Test Group', raw: true });
    await helpers.addAccountToGroup({ accountId: account.id, groupId: group.id, raw: true });

    // 5. Create budget
    const budget = await helpers.createCustomBudget({
      name: 'Test Budget',
      limitAmount: 5000,
      raw: true,
    });

    // 6. Create portfolio
    const portfolio = await helpers.createPortfolio({
      payload: { name: 'Test Portfolio' },
      raw: true,
    });

    // 7. Add another currency
    await helpers.addUserCurrencies({ currencyCodes: ['USD'], raw: true });

    // Verify all entities exist before deletion
    const accountsBefore = await helpers.getAccounts();
    const categoriesBefore = await helpers.getCategoriesList();
    const transactionsBefore = await helpers.getTransactions({ raw: true });
    const groupsBefore = await helpers.getAccountGroups({ raw: true });
    const budgetsBefore = await helpers.getCustomBudgets({ raw: true });
    const portfoliosBefore = await helpers.listPortfolios({ raw: true });
    const currenciesBefore = await helpers.getUserCurrencies();

    expect(accountsBefore.length).toBeGreaterThanOrEqual(1);
    expect(categoriesBefore.length).toBeGreaterThanOrEqual(1);
    expect(transactionsBefore.length).toBeGreaterThanOrEqual(1);
    expect(groupsBefore.length).toBeGreaterThanOrEqual(1);
    expect(budgetsBefore.length).toBeGreaterThanOrEqual(1);
    expect(portfoliosBefore.data.length).toBeGreaterThanOrEqual(1);
    expect(currenciesBefore.length).toBeGreaterThanOrEqual(2);

    // Delete user
    const deleteRes = await helpers.deleteUserAccount();
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.body.status).toBe(API_RESPONSE_STATUS.success);

    // Verify all data is deleted by querying database directly
    // (API calls will fail because user is deleted and token is invalid)
    const accountsAfter = await Accounts.findAll({ where: { id: account.id } });
    const categoriesAfter = await Categories.findAll({ where: { id: category.id } });
    const transactionsAfter = await Transactions.findAll({ where: { accountId: account.id } });
    const budgetsAfter = await Budgets.findAll({ where: { id: budget.id } });
    const portfoliosAfter = await Portfolios.findAll({ where: { id: portfolio.id } });
    const currenciesAfter = await UsersCurrencies.findAll({ where: { currencyCode: 'USD' } });
    const settingsAfter = await UserSettings.findAll({ where: {} });

    expect(accountsAfter).toHaveLength(0);
    expect(categoriesAfter).toHaveLength(0);
    expect(transactionsAfter).toHaveLength(0);
    expect(budgetsAfter).toHaveLength(0);
    expect(portfoliosAfter).toHaveLength(0);
    expect(currenciesAfter).toHaveLength(0);
    expect(settingsAfter).toHaveLength(0);
  });

  it('should delete user with multiple accounts and transactions', async () => {
    // Create multiple accounts using buildAccountPayload
    const account1 = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ name: 'Account 1' }),
      raw: true,
    });
    const account2 = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ name: 'Account 2' }),
      raw: true,
    });

    // Create multiple categories
    const category1 = await helpers.addCustomCategory({
      name: 'Category 1',
      color: '#FF0000',
      raw: true,
    });
    const category2 = await helpers.addCustomCategory({
      name: 'Category 2',
      color: '#00FF00',
      raw: true,
    });

    // Create transactions for each account
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account1.id,
        amount: 100,
        categoryId: category1.id,
      }),
      raw: true,
    });
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account1.id,
        amount: 200,
        categoryId: category2.id,
      }),
      raw: true,
    });
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account2.id,
        amount: 300,
        categoryId: category1.id,
      }),
      raw: true,
    });

    // Verify data exists
    const transactionsBefore = await helpers.getTransactions({ raw: true });
    expect(transactionsBefore.length).toBe(3);

    // Delete user
    const deleteRes = await helpers.deleteUserAccount();
    expect(deleteRes.statusCode).toBe(200);

    // Verify all data is deleted
    const accountsAfter = await Accounts.findAll({
      where: { id: [account1.id, account2.id] },
    });
    const categoriesAfter = await Categories.findAll({
      where: { id: [category1.id, category2.id] },
    });

    expect(accountsAfter).toHaveLength(0);
    expect(categoriesAfter).toHaveLength(0);
  });

  it('should delete user with nested category hierarchy', async () => {
    // Create parent category
    const parentCategory = await helpers.addCustomCategory({
      name: 'Parent Category',
      color: '#FF0000',
      raw: true,
    });

    // Create child category
    const childCategory = await helpers.addCustomCategory({
      name: 'Child Category',
      parentId: parentCategory.id,
      color: '#00FF00',
      raw: true,
    });

    // Verify hierarchy exists
    const categoriesBefore = await helpers.getCategoriesList();
    const parent = categoriesBefore.find((c) => c.id === parentCategory.id);
    expect(parent).toBeDefined();

    // Delete user
    const deleteRes = await helpers.deleteUserAccount();
    expect(deleteRes.statusCode).toBe(200);

    // Verify all categories are deleted
    const categoriesAfter = await Categories.findAll({
      where: { id: [parentCategory.id, childCategory.id] },
    });
    expect(categoriesAfter).toHaveLength(0);
  });

  it('should delete user with investment portfolio and holdings', async () => {
    // Create portfolio
    const portfolio = await helpers.createPortfolio({
      payload: { name: 'Investment Portfolio' },
      raw: true,
    });

    // Seed securities
    const securities = await helpers.seedSecurities([{ symbol: 'AAPL', name: 'Apple Inc.' }]);

    // Create holding (just portfolioId and securityId required)
    await helpers.createHolding({
      payload: {
        portfolioId: portfolio.id,
        securityId: securities[0]!.id,
      },
      raw: true,
    });

    // Verify portfolio exists
    const portfoliosBefore = await helpers.listPortfolios({ raw: true });
    expect(portfoliosBefore.data.length).toBeGreaterThanOrEqual(1);

    // Delete user
    const deleteRes = await helpers.deleteUserAccount();
    expect(deleteRes.statusCode).toBe(200);

    // Verify portfolio is deleted
    const portfoliosAfter = await Portfolios.findAll({ where: { id: portfolio.id } });
    expect(portfoliosAfter).toHaveLength(0);
  });

  it('should delete user with budget and linked transactions', async () => {
    // Create account and category
    const account = await helpers.createAccount({ raw: true });
    const category = await helpers.addCustomCategory({
      name: 'Budget Category',
      color: '#FF0000',
      raw: true,
    });

    // Create budget
    const budget = await helpers.createCustomBudget({
      name: 'Monthly Budget',
      limitAmount: 1000,
      raw: true,
    });

    // Create transaction
    const [tx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 500,
        categoryId: category.id,
        transactionType: TRANSACTION_TYPES.expense,
      }),
      raw: true,
    });

    // Add transaction to budget
    await helpers.addTransactionToCustomBudget({
      id: budget.id,
      payload: { transactionIds: [tx!.id] },
      raw: true,
    });

    // Verify budget exists
    const budgetBefore = await helpers.getCustomBudgetById({ id: budget.id, raw: true });
    expect(budgetBefore).toBeDefined();

    // Delete user
    const deleteRes = await helpers.deleteUserAccount();
    expect(deleteRes.statusCode).toBe(200);

    // Verify budget is deleted
    const budgetsAfter = await Budgets.findAll({ where: { id: budget.id } });
    expect(budgetsAfter).toHaveLength(0);
  });

  it('should delete user with refund transactions', async () => {
    // Create account
    const account = await helpers.createAccount({ raw: true });

    // Create original transaction
    const [originalTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 100,
        transactionType: TRANSACTION_TYPES.expense,
      }),
      raw: true,
    });

    // Create refund transaction
    const [refundTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 50,
        transactionType: TRANSACTION_TYPES.income,
      }),
      raw: true,
    });

    // Link refund to original
    await helpers.createSingleRefund({
      originalTxId: originalTx!.id,
      refundTxId: refundTx!.id,
    });

    // Verify transactions exist
    const transactionsBefore = await helpers.getTransactions({ raw: true });
    expect(transactionsBefore.length).toBe(2);

    // Delete user
    const deleteRes = await helpers.deleteUserAccount();
    expect(deleteRes.statusCode).toBe(200);

    // Verify transactions are deleted
    const transactionsAfter = await Transactions.findAll({
      where: { id: originalTx!.id },
    });
    expect(transactionsAfter).toHaveLength(0);
  });

  it('should delete user with custom exchange rates', async () => {
    // Add currencies
    await helpers.addUserCurrencies({ currencyCodes: ['EUR', 'GBP'], raw: true });

    // Update exchange rate
    await helpers.updateUserCurrency({
      currency: {
        currencyCode: 'EUR',
        exchangeRate: 1.1,
        liveRateUpdate: false,
      },
      raw: true,
    });

    // Verify currencies exist
    const currenciesBefore = await helpers.getUserCurrencies();
    expect(currenciesBefore.length).toBeGreaterThanOrEqual(3);

    // Delete user
    const deleteRes = await helpers.deleteUserAccount();
    expect(deleteRes.statusCode).toBe(200);

    // Verify currencies are deleted
    const currenciesAfter = await UsersCurrencies.findAll({});
    expect(currenciesAfter).toHaveLength(0);
  });

  it('should delete user with multiple account groups', async () => {
    // Create accounts
    const account1 = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ name: 'Acc 1' }),
      raw: true,
    });
    const account2 = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ name: 'Acc 2' }),
      raw: true,
    });

    // Create groups
    const group1 = await helpers.createAccountGroup({ name: 'Group 1', raw: true });
    const group2 = await helpers.createAccountGroup({ name: 'Group 2', raw: true });

    // Add accounts to groups
    await helpers.addAccountToGroup({ accountId: account1.id, groupId: group1.id, raw: true });
    await helpers.addAccountToGroup({ accountId: account2.id, groupId: group1.id, raw: true });
    await helpers.addAccountToGroup({ accountId: account1.id, groupId: group2.id, raw: true });

    // Verify groups exist
    const groupsBefore = await helpers.getAccountGroups({ raw: true });
    expect(groupsBefore.length).toBe(2);

    // Delete user
    const deleteRes = await helpers.deleteUserAccount();
    expect(deleteRes.statusCode).toBe(200);

    // Verify all data is deleted
    const accountsAfter = await Accounts.findAll({
      where: { id: [account1.id, account2.id] },
    });
    expect(accountsAfter).toHaveLength(0);
  });

  it('should delete user with user settings and excluded categories', async () => {
    // Create category
    const category = await helpers.addCustomCategory({
      name: 'Excluded Category',
      color: '#FF0000',
      raw: true,
    });

    // Add to excluded categories
    const editRes = await helpers.editExcludedCategories({
      addIds: [category.id],
    });
    expect(editRes.statusCode).toBe(200);

    // Verify settings exist
    const settingsBefore = await helpers.getUserSettings({ raw: true });
    expect(settingsBefore.stats.expenses.excludedCategories).toContain(category.id);

    // Delete user
    const deleteRes = await helpers.deleteUserAccount();
    expect(deleteRes.statusCode).toBe(200);

    // Verify settings are deleted
    const settingsAfter = await UserSettings.findAll({});
    expect(settingsAfter).toHaveLength(0);
  });

  it('should delete user from better-auth tables (ba_*)', async () => {
    // Get authUserId before deletion (the mock always returns 'test-user-id')
    const user = await Users.findOne({ where: {} });
    expect(user).not.toBeNull();
    const authUserId = user!.authUserId;

    // Verify ba_user record exists before deletion
    const [baUserBefore] = await connection.sequelize.query('SELECT id FROM ba_user WHERE id = :authUserId', {
      replacements: { authUserId },
    });
    expect((baUserBefore as { id: string }[]).length).toBe(1);

    // Verify ba_session exists (created during login in beforeEach)
    const [baSessionBefore] = await connection.sequelize.query(
      'SELECT id FROM ba_session WHERE "userId" = :authUserId',
      { replacements: { authUserId } },
    );
    expect((baSessionBefore as { id: string }[]).length).toBeGreaterThanOrEqual(1);

    // Verify ba_account exists
    const [baAccountBefore] = await connection.sequelize.query(
      'SELECT id FROM ba_account WHERE "userId" = :authUserId',
      { replacements: { authUserId } },
    );
    expect((baAccountBefore as { id: string }[]).length).toBeGreaterThanOrEqual(1);

    // Delete user
    const deleteRes = await helpers.deleteUserAccount();
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.body.status).toBe(API_RESPONSE_STATUS.success);

    // Verify ba_user is deleted
    const [baUserAfter] = await connection.sequelize.query('SELECT id FROM ba_user WHERE id = :authUserId', {
      replacements: { authUserId },
    });
    expect((baUserAfter as { id: string }[]).length).toBe(0);

    // Verify ba_session is deleted (CASCADE from ba_user)
    const [baSessionAfter] = await connection.sequelize.query(
      'SELECT id FROM ba_session WHERE "userId" = :authUserId',
      { replacements: { authUserId } },
    );
    expect((baSessionAfter as { id: string }[]).length).toBe(0);

    // Verify ba_account is deleted (CASCADE from ba_user)
    const [baAccountAfter] = await connection.sequelize.query(
      'SELECT id FROM ba_account WHERE "userId" = :authUserId',
      { replacements: { authUserId } },
    );
    expect((baAccountAfter as { id: string }[]).length).toBe(0);

    // Verify ba_passkey is deleted (CASCADE from ba_user)
    const [baPasskeyAfter] = await connection.sequelize.query(
      'SELECT id FROM ba_passkey WHERE "userId" = :authUserId',
      { replacements: { authUserId } },
    );
    expect((baPasskeyAfter as { id: string }[]).length).toBe(0);
  });
});
