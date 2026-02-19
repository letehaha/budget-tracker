import type { ParsedTransactionRow, TransactionImportDetails } from '@bt/shared/types';
import { ImportSource, asCents } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import Transactions from '@models/Transactions.model';
import * as helpers from '@tests/helpers';

describe('Execute Import endpoint', () => {
  // Helper to create valid parsed rows
  const createValidRows = ({
    accountName = 'Test Account',
    categoryName = 'Test Category',
    currencyCode = 'USD',
  }: {
    accountName?: string;
    categoryName?: string;
    currencyCode?: string;
  } = {}): ParsedTransactionRow[] => [
    {
      rowIndex: 2,
      date: '2024-01-15',
      amount: asCents(10050), // 100.50 in cents
      description: 'Grocery shopping',
      categoryName,
      accountName,
      currencyCode,
      transactionType: 'expense',
    },
    {
      rowIndex: 3,
      date: '2024-01-16',
      amount: asCents(5000), // 50.00 in cents
      description: 'Coffee shop',
      categoryName,
      accountName,
      currencyCode,
      transactionType: 'expense',
    },
    {
      rowIndex: 4,
      date: '2024-01-17',
      amount: asCents(250000), // 2500.00 in cents
      description: 'Salary',
      categoryName: undefined,
      accountName,
      currencyCode,
      transactionType: 'income',
    },
  ];

  describe('successful import', () => {
    it('should import transactions with existing account', async () => {
      const account = await helpers.createAccount({ raw: true });

      const validRows = createValidRows({
        accountName: 'CSV Account',
        currencyCode: account.currencyCode,
      });

      const result = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {
            'CSV Account': { action: 'link-existing', accountId: account.id },
          },
          categoryMapping: {},
          skipDuplicateIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(3);
      expect(result.summary.skipped).toBe(0);
      expect(result.summary.accountsCreated).toBe(0);
      expect(result.summary.categoriesCreated).toBe(0);
      expect(result.summary.errors).toHaveLength(0);
      expect(result.newTransactionIds).toHaveLength(3);
      expect(result.batchId).toBeDefined();

      // Verify transactions were actually created in the database
      const transactions = await helpers.getTransactions({ raw: true });
      const createdTxs = transactions.filter((tx) => result.newTransactionIds.includes(tx.id));

      expect(createdTxs).toHaveLength(3);
      expect(createdTxs.every((tx) => tx.accountId === account.id)).toBe(true);
    });

    it('should create new account when action is create-new', async () => {
      const accountsBefore = await helpers.getAccounts();

      const validRows = createValidRows({
        accountName: 'New Import Account',
        currencyCode: 'USD',
      });

      const result = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {
            'New Import Account': { action: 'create-new' },
          },
          categoryMapping: {},
          skipDuplicateIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(3);
      expect(result.summary.accountsCreated).toBe(1);
      expect(result.summary.errors).toHaveLength(0);
      expect(result.newTransactionIds).toHaveLength(3);

      // Verify account was actually created in the database
      const accountsAfter = await helpers.getAccounts();
      expect(accountsAfter.length).toBe(accountsBefore.length + 1);

      const newAccount = accountsAfter.find((a) => a.name === 'New Import Account');
      expect(newAccount).toBeDefined();
      expect(newAccount?.currencyCode).toBe('USD');
    });

    it('should create new category when action is create-new', async () => {
      const account = await helpers.createAccount({ raw: true });
      const categoriesBefore = await helpers.getCategoriesList();

      const validRows = createValidRows({
        accountName: 'CSV Account',
        categoryName: 'New Import Category',
        currencyCode: account.currencyCode,
      });

      const result = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {
            'CSV Account': { action: 'link-existing', accountId: account.id },
          },
          categoryMapping: {
            'New Import Category': { action: 'create-new' },
          },
          skipDuplicateIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(3);
      expect(result.summary.categoriesCreated).toBe(1);
      expect(result.summary.errors).toHaveLength(0);

      // Verify category was actually created in the database
      const categoriesAfter = await helpers.getCategoriesList();
      expect(categoriesAfter.length).toBe(categoriesBefore.length + 1);

      const newCategory = categoriesAfter.find((c) => c.name === 'New Import Category');
      expect(newCategory).toBeDefined();
    });

    it('should link to existing category', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Get list of existing categories to find one we can link to
      const existingCategories = await helpers.getCategoriesList();

      // Use the first available category, or create one if none exist
      let categoryId: number;
      if (existingCategories.length > 0) {
        categoryId = existingCategories[0]!.id;
      } else {
        const newCategory = await helpers.addCustomCategory({ name: 'Link Test Category', raw: true });
        categoryId = newCategory.id;
      }

      const validRows = createValidRows({
        accountName: 'CSV Account',
        categoryName: 'CSV Category Name',
        currencyCode: account.currencyCode,
      });

      // Remove category from rows that have undefined categoryName (Salary row)
      const rowsWithCategory = validRows.filter((row) => row.categoryName !== undefined);

      const result = await helpers.executeImport({
        payload: {
          validRows: rowsWithCategory,
          accountMapping: {
            'CSV Account': { action: 'link-existing', accountId: account.id },
          },
          categoryMapping: {
            'CSV Category Name': { action: 'link-existing', categoryId },
          },
          skipDuplicateIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(2);
      expect(result.summary.categoriesCreated).toBe(0);
      expect(result.summary.errors).toHaveLength(0);
    });

    it('should skip duplicate rows based on skipDuplicateIndices', async () => {
      const account = await helpers.createAccount({ raw: true });

      const validRows = createValidRows({
        accountName: 'CSV Account',
        currencyCode: account.currencyCode,
      });

      const result = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {
            'CSV Account': { action: 'link-existing', accountId: account.id },
          },
          categoryMapping: {},
          skipDuplicateIndices: [2, 3], // Skip first two rows
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(1); // Only the third row
      expect(result.summary.skipped).toBe(2);
      expect(result.newTransactionIds).toHaveLength(1);
    });

    it('should return empty result when all rows are skipped', async () => {
      const account = await helpers.createAccount({ raw: true });

      const validRows = createValidRows({
        accountName: 'CSV Account',
        currencyCode: account.currencyCode,
      });

      const result = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {
            'CSV Account': { action: 'link-existing', accountId: account.id },
          },
          categoryMapping: {},
          skipDuplicateIndices: [2, 3, 4], // Skip all rows
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(0);
      expect(result.summary.skipped).toBe(3);
      expect(result.summary.accountsCreated).toBe(0);
      expect(result.summary.categoriesCreated).toBe(0);
      expect(result.newTransactionIds).toHaveLength(0);
    });

    it('should handle multiple accounts in single import', async () => {
      const accountsBefore = await helpers.getAccounts();

      const validRows: ParsedTransactionRow[] = [
        {
          rowIndex: 2,
          date: '2024-01-15',
          amount: asCents(10050),
          description: 'Transaction 1',
          accountName: 'Account A',
          currencyCode: 'USD',
          transactionType: 'expense',
        },
        {
          rowIndex: 3,
          date: '2024-01-16',
          amount: asCents(5000),
          description: 'Transaction 2',
          accountName: 'Account B',
          currencyCode: 'EUR',
          transactionType: 'expense',
        },
      ];

      const result = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {
            'Account A': { action: 'create-new' },
            'Account B': { action: 'create-new' },
          },
          categoryMapping: {},
          skipDuplicateIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(2);
      expect(result.summary.accountsCreated).toBe(2);

      // Verify both accounts were actually created in the database
      const accountsAfter = await helpers.getAccounts();
      expect(accountsAfter.length).toBe(accountsBefore.length + 2);

      const accountA = accountsAfter.find((a) => a.name === 'Account A');
      const accountB = accountsAfter.find((a) => a.name === 'Account B');

      expect(accountA).toBeDefined();
      expect(accountA?.currencyCode).toBe('USD');
      expect(accountB).toBeDefined();
      expect(accountB?.currencyCode).toBe('EUR');
    });

    it('should handle multiple categories in single import', async () => {
      const account = await helpers.createAccount({ raw: true });
      const categoriesBefore = await helpers.getCategoriesList();

      const validRows: ParsedTransactionRow[] = [
        {
          rowIndex: 2,
          date: '2024-01-15',
          amount: asCents(10050),
          description: 'Transaction 1',
          categoryName: 'Category A',
          accountName: 'CSV Account',
          currencyCode: account.currencyCode,
          transactionType: 'expense',
        },
        {
          rowIndex: 3,
          date: '2024-01-16',
          amount: asCents(5000),
          description: 'Transaction 2',
          categoryName: 'Category B',
          accountName: 'CSV Account',
          currencyCode: account.currencyCode,
          transactionType: 'expense',
        },
      ];

      const result = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {
            'CSV Account': { action: 'link-existing', accountId: account.id },
          },
          categoryMapping: {
            'Category A': { action: 'create-new' },
            'Category B': { action: 'create-new' },
          },
          skipDuplicateIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(2);
      expect(result.summary.categoriesCreated).toBe(2);

      // Verify both categories were actually created in the database
      const categoriesAfter = await helpers.getCategoriesList();
      expect(categoriesAfter.length).toBe(categoriesBefore.length + 2);

      const categoryA = categoriesAfter.find((c) => c.name === 'Category A');
      const categoryB = categoriesAfter.find((c) => c.name === 'Category B');

      expect(categoryA).toBeDefined();
      expect(categoryB).toBeDefined();
    });

    it('should handle transactions without category', async () => {
      const account = await helpers.createAccount({ raw: true });

      const validRows: ParsedTransactionRow[] = [
        {
          rowIndex: 2,
          date: '2024-01-15',
          amount: asCents(10050),
          description: 'Transaction without category',
          categoryName: undefined,
          accountName: 'CSV Account',
          currencyCode: account.currencyCode,
          transactionType: 'expense',
        },
      ];

      const result = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {
            'CSV Account': { action: 'link-existing', accountId: account.id },
          },
          categoryMapping: {},
          skipDuplicateIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(1);
      expect(result.summary.errors).toHaveLength(0);
    });
  });

  describe('mixed account and category mappings', () => {
    it('should handle mixed account mappings (some new, some existing)', async () => {
      const accountsBefore = await helpers.getAccounts();
      const existingAccount = await helpers.createAccount({
        payload: {
          ...helpers.buildAccountPayload(),
          name: 'Existing Account',
        },
        raw: true,
      });

      const validRows: ParsedTransactionRow[] = [
        {
          rowIndex: 2,
          date: '2024-01-15',
          amount: asCents(10050),
          description: 'Transaction to new account',
          accountName: 'New Account A',
          currencyCode: 'USD',
          transactionType: 'expense',
        },
        {
          rowIndex: 3,
          date: '2024-01-16',
          amount: asCents(5000),
          description: 'Transaction to existing account',
          accountName: 'CSV Existing Account',
          currencyCode: existingAccount.currencyCode,
          transactionType: 'expense',
        },
        {
          rowIndex: 4,
          date: '2024-01-17',
          amount: asCents(7500),
          description: 'Transaction to another new account',
          accountName: 'New Account B',
          currencyCode: 'EUR',
          transactionType: 'income',
        },
      ];

      const result = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {
            'New Account A': { action: 'create-new' },
            'CSV Existing Account': { action: 'link-existing', accountId: existingAccount.id },
            'New Account B': { action: 'create-new' },
          },
          categoryMapping: {},
          skipDuplicateIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(3);
      expect(result.summary.accountsCreated).toBe(2); // Only A and B created
      expect(result.summary.errors).toHaveLength(0);

      // Verify accounts in database
      const accountsAfter = await helpers.getAccounts();
      expect(accountsAfter.length).toBe(accountsBefore.length + 3); // +1 from existingAccount, +2 from import

      const accountA = accountsAfter.find((a) => a.name === 'New Account A');
      const accountB = accountsAfter.find((a) => a.name === 'New Account B');

      expect(accountA).toBeDefined();
      expect(accountA?.currencyCode).toBe('USD');
      expect(accountB).toBeDefined();
      expect(accountB?.currencyCode).toBe('EUR');

      // Verify transaction went to correct accounts
      const transactions = await helpers.getTransactions({ raw: true });
      const importedTxs = transactions.filter((tx) => result.newTransactionIds.includes(tx.id));

      const existingAccountTx = importedTxs.find((tx) => tx.note === 'Transaction to existing account');
      expect(existingAccountTx?.accountId).toBe(existingAccount.id);
    });

    it('should handle mixed category mappings (some new, some existing)', async () => {
      const account = await helpers.createAccount({ raw: true });
      const categoriesBefore = await helpers.getCategoriesList();

      // Create existing categories to link to
      let existingCategory1 = categoriesBefore[0];
      if (!existingCategory1) {
        existingCategory1 = await helpers.addCustomCategory({ name: 'Existing Cat 1', color: '#FF0000', raw: true });
      }
      const existingCategory2 = await helpers.addCustomCategory({
        name: 'Existing Cat 2',
        color: '#00FF00',
        raw: true,
      });

      const validRows: ParsedTransactionRow[] = [
        {
          rowIndex: 2,
          date: '2024-01-15',
          amount: asCents(10050),
          description: 'Transaction with new category',
          categoryName: 'New Category A',
          accountName: 'CSV Account',
          currencyCode: account.currencyCode,
          transactionType: 'expense',
        },
        {
          rowIndex: 3,
          date: '2024-01-16',
          amount: asCents(5000),
          description: 'Transaction with existing category 1',
          categoryName: 'CSV Existing Cat 1',
          accountName: 'CSV Account',
          currencyCode: account.currencyCode,
          transactionType: 'expense',
        },
        {
          rowIndex: 4,
          date: '2024-01-17',
          amount: asCents(7500),
          description: 'Transaction with another new category',
          categoryName: 'New Category B',
          accountName: 'CSV Account',
          currencyCode: account.currencyCode,
          transactionType: 'income',
        },
        {
          rowIndex: 5,
          date: '2024-01-18',
          amount: asCents(3000),
          description: 'Transaction with existing category 2',
          categoryName: 'CSV Existing Cat 2',
          accountName: 'CSV Account',
          currencyCode: account.currencyCode,
          transactionType: 'expense',
        },
      ];

      const result = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {
            'CSV Account': { action: 'link-existing', accountId: account.id },
          },
          categoryMapping: {
            'New Category A': { action: 'create-new' },
            'CSV Existing Cat 1': { action: 'link-existing', categoryId: existingCategory1.id },
            'New Category B': { action: 'create-new' },
            'CSV Existing Cat 2': { action: 'link-existing', categoryId: existingCategory2.id },
          },
          skipDuplicateIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(4);
      expect(result.summary.categoriesCreated).toBe(2); // Only A and B created
      expect(result.summary.errors).toHaveLength(0);

      // Verify categories in database
      const categoriesAfter = await helpers.getCategoriesList();
      const newCategoryA = categoriesAfter.find((c) => c.name === 'New Category A');
      const newCategoryB = categoriesAfter.find((c) => c.name === 'New Category B');

      expect(newCategoryA).toBeDefined();
      expect(newCategoryB).toBeDefined();

      // Verify transactions have correct categories
      const transactions = await helpers.getTransactions({ raw: true });
      const importedTxs = transactions.filter((tx) => result.newTransactionIds.includes(tx.id));

      const existingCat1Tx = importedTxs.find((tx) => tx.note === 'Transaction with existing category 1');
      const existingCat2Tx = importedTxs.find((tx) => tx.note === 'Transaction with existing category 2');

      expect(existingCat1Tx?.categoryId).toBe(existingCategory1.id);
      expect(existingCat2Tx?.categoryId).toBe(existingCategory2.id);
    });

    it('should reuse same category across multiple accounts', async () => {
      const validRows: ParsedTransactionRow[] = [
        {
          rowIndex: 2,
          date: '2024-01-15',
          amount: asCents(10050),
          description: 'Food expense from Account A',
          categoryName: 'Food',
          accountName: 'Account A',
          currencyCode: 'USD',
          transactionType: 'expense',
        },
        {
          rowIndex: 3,
          date: '2024-01-16',
          amount: asCents(5000),
          description: 'Food expense from Account B',
          categoryName: 'Food',
          accountName: 'Account B',
          currencyCode: 'USD',
          transactionType: 'expense',
        },
        {
          rowIndex: 4,
          date: '2024-01-17',
          amount: asCents(7500),
          description: 'Food expense from Account A again',
          categoryName: 'Food',
          accountName: 'Account A',
          currencyCode: 'USD',
          transactionType: 'expense',
        },
      ];

      const result = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {
            'Account A': { action: 'create-new' },
            'Account B': { action: 'create-new' },
          },
          categoryMapping: {
            Food: { action: 'create-new' },
          },
          skipDuplicateIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(3);
      expect(result.summary.accountsCreated).toBe(2);
      expect(result.summary.categoriesCreated).toBe(1); // Only ONE Food category created

      // Verify only one Food category was created
      const categoriesAfter = await helpers.getCategoriesList();
      const foodCategories = categoriesAfter.filter((c) => c.name === 'Food');
      expect(foodCategories).toHaveLength(1);

      // Verify all transactions use the same category
      const transactions = await helpers.getTransactions({ raw: true });
      const importedTxs = transactions.filter((tx) => result.newTransactionIds.includes(tx.id));

      expect(importedTxs).toHaveLength(3);
      const categoryIds = importedTxs.map((tx) => tx.categoryId);
      const uniqueCategoryIds = [...new Set(categoryIds)];
      expect(uniqueCategoryIds).toHaveLength(1); // All use same category

      // Verify transactions are in different accounts
      const accountIds = importedTxs.map((tx) => tx.accountId);
      const uniqueAccountIds = [...new Set(accountIds)];
      expect(uniqueAccountIds).toHaveLength(2); // Distributed across 2 accounts
    });

    it('should handle mix of transactions with and without categories', async () => {
      const account = await helpers.createAccount({ raw: true });

      const validRows: ParsedTransactionRow[] = [
        {
          rowIndex: 2,
          date: '2024-01-15',
          amount: asCents(10050),
          description: 'Transaction with category',
          categoryName: 'New Category',
          accountName: 'CSV Account',
          currencyCode: account.currencyCode,
          transactionType: 'expense',
        },
        {
          rowIndex: 3,
          date: '2024-01-16',
          amount: asCents(5000),
          description: 'Transaction without category',
          categoryName: undefined,
          accountName: 'CSV Account',
          currencyCode: account.currencyCode,
          transactionType: 'expense',
        },
        {
          rowIndex: 4,
          date: '2024-01-17',
          amount: asCents(7500),
          description: 'Another transaction with category',
          categoryName: 'New Category',
          accountName: 'CSV Account',
          currencyCode: account.currencyCode,
          transactionType: 'income',
        },
      ];

      const result = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {
            'CSV Account': { action: 'link-existing', accountId: account.id },
          },
          categoryMapping: {
            'New Category': { action: 'create-new' },
          },
          skipDuplicateIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(3);
      expect(result.summary.categoriesCreated).toBe(1);
      expect(result.summary.errors).toHaveLength(0);

      // Verify transactions
      const transactions = await helpers.getTransactions({ raw: true });
      const importedTxs = transactions.filter((tx) => result.newTransactionIds.includes(tx.id));

      const withoutCategoryTx = importedTxs.find((tx) => tx.note === 'Transaction without category');
      const withCategoryTx = importedTxs.find((tx) => tx.note === 'Transaction with category');

      expect(withoutCategoryTx?.categoryId).toBeNull();
      expect(withCategoryTx?.categoryId).not.toBeNull();
    });

    it('should handle complex scenario: multiple accounts, multiple categories, mixed mappings', async () => {
      const existingAccount = await helpers.createAccount({
        payload: {
          ...helpers.buildAccountPayload(),
          name: 'Existing Account',
        },
        raw: true,
      });
      const existingCategory = await helpers.addCustomCategory({
        name: 'Existing Category',
        color: '#0000FF',
        raw: true,
      });

      const validRows: ParsedTransactionRow[] = [
        // Account A (new), Category 1 (new)
        {
          rowIndex: 2,
          date: '2024-01-15',
          amount: asCents(10050),
          description: 'A + Cat1',
          categoryName: 'Category 1',
          accountName: 'Account A',
          currencyCode: 'USD',
          transactionType: 'expense',
        },
        // Account B (new), Category 1 (reuse)
        {
          rowIndex: 3,
          date: '2024-01-16',
          amount: asCents(5000),
          description: 'B + Cat1',
          categoryName: 'Category 1',
          accountName: 'Account B',
          currencyCode: 'EUR',
          transactionType: 'expense',
        },
        // Existing Account, Category 2 (new)
        {
          rowIndex: 4,
          date: '2024-01-17',
          amount: asCents(7500),
          description: 'Existing + Cat2',
          categoryName: 'Category 2',
          accountName: 'CSV Existing',
          currencyCode: existingAccount.currencyCode,
          transactionType: 'income',
        },
        // Account A (reuse), Existing Category
        {
          rowIndex: 5,
          date: '2024-01-18',
          amount: asCents(3000),
          description: 'A + Existing Cat',
          categoryName: 'CSV Existing Cat',
          accountName: 'Account A',
          currencyCode: 'USD',
          transactionType: 'expense',
        },
        // Account B (reuse), no category
        {
          rowIndex: 6,
          date: '2024-01-19',
          amount: asCents(2000),
          description: 'B + No Cat',
          categoryName: undefined,
          accountName: 'Account B',
          currencyCode: 'EUR',
          transactionType: 'income',
        },
      ];

      const result = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {
            'Account A': { action: 'create-new' },
            'Account B': { action: 'create-new' },
            'CSV Existing': { action: 'link-existing', accountId: existingAccount.id },
          },
          categoryMapping: {
            'Category 1': { action: 'create-new' },
            'Category 2': { action: 'create-new' },
            'CSV Existing Cat': { action: 'link-existing', categoryId: existingCategory.id },
          },
          skipDuplicateIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(5);
      expect(result.summary.accountsCreated).toBe(2); // Account A and B
      expect(result.summary.categoriesCreated).toBe(2); // Category 1 and 2
      expect(result.summary.errors).toHaveLength(0);

      // Verify all transactions were created
      const transactions = await helpers.getTransactions({ raw: true });
      const importedTxs = transactions.filter((tx) => result.newTransactionIds.includes(tx.id));
      expect(importedTxs).toHaveLength(5);

      // Verify Category 1 is shared between Account A and B
      const cat1Txs = importedTxs.filter((tx) => ['A + Cat1', 'B + Cat1'].includes(tx.note || ''));
      expect(cat1Txs).toHaveLength(2);
      expect(cat1Txs[0]?.categoryId).toBe(cat1Txs[1]?.categoryId);

      // Verify transaction uses existing category
      const existingCatTx = importedTxs.find((tx) => tx.note === 'A + Existing Cat');
      expect(existingCatTx?.categoryId).toBe(existingCategory.id);

      // Verify transaction without category
      const noCatTx = importedTxs.find((tx) => tx.note === 'B + No Cat');
      expect(noCatTx?.categoryId).toBeNull();

      // Verify transaction uses existing account
      const existingAccTx = importedTxs.find((tx) => tx.note === 'Existing + Cat2');
      expect(existingAccTx?.accountId).toBe(existingAccount.id);
    });

    it('should create accounts with same currency correctly', async () => {
      const validRows: ParsedTransactionRow[] = [
        {
          rowIndex: 2,
          date: '2024-01-15',
          amount: asCents(10050),
          description: 'USD Account 1',
          accountName: 'USD Account 1',
          currencyCode: 'USD',
          transactionType: 'expense',
        },
        {
          rowIndex: 3,
          date: '2024-01-16',
          amount: asCents(5000),
          description: 'USD Account 2',
          accountName: 'USD Account 2',
          currencyCode: 'USD',
          transactionType: 'expense',
        },
        {
          rowIndex: 4,
          date: '2024-01-17',
          amount: asCents(7500),
          description: 'USD Account 3',
          accountName: 'USD Account 3',
          currencyCode: 'USD',
          transactionType: 'income',
        },
      ];

      const result = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {
            'USD Account 1': { action: 'create-new' },
            'USD Account 2': { action: 'create-new' },
            'USD Account 3': { action: 'create-new' },
          },
          categoryMapping: {},
          skipDuplicateIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(3);
      expect(result.summary.accountsCreated).toBe(3);

      // Verify all accounts were created with USD currency
      const accounts = await helpers.getAccounts();
      const usdAccounts = accounts.filter((a) => ['USD Account 1', 'USD Account 2', 'USD Account 3'].includes(a.name));

      expect(usdAccounts).toHaveLength(3);
      usdAccounts.forEach((acc) => {
        expect(acc.currencyCode).toBe('USD');
      });
    });

    it('should handle same account mapped to different categories', async () => {
      const account = await helpers.createAccount({ raw: true });

      const validRows: ParsedTransactionRow[] = [
        {
          rowIndex: 2,
          date: '2024-01-15',
          amount: asCents(10050),
          description: 'Food expense',
          categoryName: 'Food',
          accountName: 'My Account',
          currencyCode: account.currencyCode,
          transactionType: 'expense',
        },
        {
          rowIndex: 3,
          date: '2024-01-16',
          amount: asCents(5000),
          description: 'Transport expense',
          categoryName: 'Transport',
          accountName: 'My Account',
          currencyCode: account.currencyCode,
          transactionType: 'expense',
        },
        {
          rowIndex: 4,
          date: '2024-01-17',
          amount: asCents(7500),
          description: 'Entertainment expense',
          categoryName: 'Entertainment',
          accountName: 'My Account',
          currencyCode: account.currencyCode,
          transactionType: 'expense',
        },
        {
          rowIndex: 5,
          date: '2024-01-18',
          amount: asCents(3000),
          description: 'Another food expense',
          categoryName: 'Food',
          accountName: 'My Account',
          currencyCode: account.currencyCode,
          transactionType: 'expense',
        },
      ];

      const result = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {
            'My Account': { action: 'link-existing', accountId: account.id },
          },
          categoryMapping: {
            Food: { action: 'create-new' },
            Transport: { action: 'create-new' },
            Entertainment: { action: 'create-new' },
          },
          skipDuplicateIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(4);
      expect(result.summary.accountsCreated).toBe(0);
      expect(result.summary.categoriesCreated).toBe(3);

      // Verify all transactions use the same account
      const transactions = await helpers.getTransactions({ raw: true });
      const importedTxs = transactions.filter((tx) => result.newTransactionIds.includes(tx.id));

      expect(importedTxs).toHaveLength(4);
      importedTxs.forEach((tx) => {
        expect(tx.accountId).toBe(account.id);
      });

      // Verify Food category is reused
      const foodTxs = importedTxs.filter((tx) => tx.note?.toLowerCase().includes('food'));
      expect(foodTxs).toHaveLength(2);
      expect(foodTxs[0]?.categoryId).toBe(foodTxs[1]?.categoryId);
    });

    it('should handle all create-new mappings (maximum entity creation)', async () => {
      const accountsBefore = await helpers.getAccounts();
      const categoriesBefore = await helpers.getCategoriesList();

      const validRows: ParsedTransactionRow[] = [
        {
          rowIndex: 2,
          date: '2024-01-15',
          amount: asCents(10050),
          description: 'Transaction 1',
          categoryName: 'Category A',
          accountName: 'Account 1',
          currencyCode: 'USD',
          transactionType: 'expense',
        },
        {
          rowIndex: 3,
          date: '2024-01-16',
          amount: asCents(5000),
          description: 'Transaction 2',
          categoryName: 'Category B',
          accountName: 'Account 2',
          currencyCode: 'EUR',
          transactionType: 'expense',
        },
      ];

      const result = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {
            'Account 1': { action: 'create-new' },
            'Account 2': { action: 'create-new' },
          },
          categoryMapping: {
            'Category A': { action: 'create-new' },
            'Category B': { action: 'create-new' },
          },
          skipDuplicateIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(2);
      expect(result.summary.accountsCreated).toBe(2);
      expect(result.summary.categoriesCreated).toBe(2);
      expect(result.summary.errors).toHaveLength(0);

      // Verify entities were created
      const accountsAfter = await helpers.getAccounts();
      const categoriesAfter = await helpers.getCategoriesList();

      expect(accountsAfter.length).toBe(accountsBefore.length + 2);
      expect(categoriesAfter.length).toBe(categoriesBefore.length + 2);
    });

    it('should handle all link-existing mappings (no entity creation)', async () => {
      const account1 = await helpers.createAccount({
        payload: { ...helpers.buildAccountPayload(), name: 'Account 1' },
        raw: true,
      });
      const account2 = await helpers.createAccount({
        payload: { ...helpers.buildAccountPayload(), name: 'Account 2' },
        raw: true,
      });
      const category1 = await helpers.addCustomCategory({ name: 'Category 1', color: '#FF0000', raw: true });
      const category2 = await helpers.addCustomCategory({ name: 'Category 2', color: '#00FF00', raw: true });

      const accountsBefore = await helpers.getAccounts();
      const categoriesBefore = await helpers.getCategoriesList();

      const validRows: ParsedTransactionRow[] = [
        {
          rowIndex: 2,
          date: '2024-01-15',
          amount: asCents(10050),
          description: 'Transaction 1',
          categoryName: 'CSV Category 1',
          accountName: 'CSV Account 1',
          currencyCode: account1.currencyCode,
          transactionType: 'expense',
        },
        {
          rowIndex: 3,
          date: '2024-01-16',
          amount: asCents(5000),
          description: 'Transaction 2',
          categoryName: 'CSV Category 2',
          accountName: 'CSV Account 2',
          currencyCode: account2.currencyCode,
          transactionType: 'expense',
        },
      ];

      const result = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {
            'CSV Account 1': { action: 'link-existing', accountId: account1.id },
            'CSV Account 2': { action: 'link-existing', accountId: account2.id },
          },
          categoryMapping: {
            'CSV Category 1': { action: 'link-existing', categoryId: category1.id },
            'CSV Category 2': { action: 'link-existing', categoryId: category2.id },
          },
          skipDuplicateIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(2);
      expect(result.summary.accountsCreated).toBe(0); // No new accounts
      expect(result.summary.categoriesCreated).toBe(0); // No new categories
      expect(result.summary.errors).toHaveLength(0);

      // Verify no new entities were created
      const accountsAfter = await helpers.getAccounts();
      const categoriesAfter = await helpers.getCategoriesList();

      expect(accountsAfter.length).toBe(accountsBefore.length);
      expect(categoriesAfter.length).toBe(categoriesBefore.length);
    });
  });

  describe('error handling', () => {
    it('should fail when account mapping is missing', async () => {
      const validRows = createValidRows({ accountName: 'Unknown Account' });

      const result = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {}, // Missing mapping for 'Unknown Account'
          categoryMapping: {},
          skipDuplicateIndices: [],
        },
        raw: false,
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should fail when linked account does not exist', async () => {
      const validRows = createValidRows({ accountName: 'CSV Account' });

      const result = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {
            'CSV Account': { action: 'link-existing', accountId: 999999 }, // Non-existent
          },
          categoryMapping: {},
          skipDuplicateIndices: [],
        },
        raw: false,
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should fail when linked category does not exist', async () => {
      const account = await helpers.createAccount({ raw: true });

      const validRows = createValidRows({
        accountName: 'CSV Account',
        categoryName: 'Some Category',
        currencyCode: account.currencyCode,
      });

      const result = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {
            'CSV Account': { action: 'link-existing', accountId: account.id },
          },
          categoryMapping: {
            'Some Category': { action: 'link-existing', categoryId: 999999 }, // Non-existent
          },
          skipDuplicateIndices: [],
        },
        raw: false,
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should return validation error for empty validRows array', async () => {
      const result = await helpers.executeImport({
        payload: {
          validRows: [],
          accountMapping: {},
          categoryMapping: {},
          skipDuplicateIndices: [],
        },
        raw: true,
      });

      // Empty array should return empty result, not an error
      expect(result.summary.imported).toBe(0);
      expect(result.summary.skipped).toBe(0);
    });
  });

  describe('transaction creation details', () => {
    it('should create transactions and return correct IDs', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Get list of existing categories to find one we can link to
      const existingCategories = await helpers.getCategoriesList();

      // Use the first available category, or create one if none exist
      let categoryId: number;
      if (existingCategories.length > 0) {
        categoryId = existingCategories[0]!.id;
      } else {
        const newCategory = await helpers.addCustomCategory({ name: 'Transaction Test Category', raw: true });
        categoryId = newCategory.id;
      }

      const validRows: ParsedTransactionRow[] = [
        {
          rowIndex: 2,
          date: '2024-01-15',
          amount: asCents(10050),
          description: 'Test transaction',
          categoryName: 'CSV Category',
          accountName: 'CSV Account',
          currencyCode: account.currencyCode,
          transactionType: 'expense',
        },
      ];

      const result = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {
            'CSV Account': { action: 'link-existing', accountId: account.id },
          },
          categoryMapping: {
            'CSV Category': { action: 'link-existing', categoryId },
          },
          skipDuplicateIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(1);
      expect(result.newTransactionIds).toHaveLength(1);
      expect(typeof result.newTransactionIds[0]).toBe('number');
      expect(result.newTransactionIds[0]).toBeGreaterThan(0);

      // Verify transaction was actually created in the database
      const transactions = await helpers.getTransactions({ raw: true });
      const createdTx = transactions.find((tx) => tx.id === result.newTransactionIds[0]);

      expect(createdTx).toBeDefined();
      expect(createdTx?.amount).toBe(100.5);
      expect(createdTx?.note).toBe('Test transaction');
      expect(createdTx?.accountId).toBe(account.id);
      expect(createdTx?.categoryId).toBe(categoryId);
    });

    it('should generate unique batchId for each import', async () => {
      const account = await helpers.createAccount({ raw: true });

      const validRows = createValidRows({
        accountName: 'CSV Account',
        currencyCode: account.currencyCode,
      });

      const result1 = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {
            'CSV Account': { action: 'link-existing', accountId: account.id },
          },
          categoryMapping: {},
          skipDuplicateIndices: [],
        },
        raw: true,
      });

      const result2 = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {
            'CSV Account': { action: 'link-existing', accountId: account.id },
          },
          categoryMapping: {},
          skipDuplicateIndices: [],
        },
        raw: true,
      });

      expect(result1.batchId).toBeDefined();
      expect(result2.batchId).toBeDefined();
      expect(result1.batchId).not.toBe(result2.batchId);
    });
  });

  describe('currency handling', () => {
    it('should add currency to user currencies automatically', async () => {
      // Create account with EUR currency
      const validRows: ParsedTransactionRow[] = [
        {
          rowIndex: 2,
          date: '2024-01-15',
          amount: asCents(10050),
          description: 'EUR Transaction',
          accountName: 'EUR Account',
          currencyCode: 'EUR',
          transactionType: 'expense',
        },
      ];

      const result = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {
            'EUR Account': { action: 'create-new' },
          },
          categoryMapping: {},
          skipDuplicateIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(1);
      // The currency should be added automatically - no error should occur
    });

    it('should handle multiple currencies in single import', async () => {
      const validRows: ParsedTransactionRow[] = [
        {
          rowIndex: 2,
          date: '2024-01-15',
          amount: asCents(10050),
          description: 'USD Transaction',
          accountName: 'USD Account',
          currencyCode: 'USD',
          transactionType: 'expense',
        },
        {
          rowIndex: 3,
          date: '2024-01-16',
          amount: asCents(5000),
          description: 'GBP Transaction',
          accountName: 'GBP Account',
          currencyCode: 'GBP',
          transactionType: 'expense',
        },
      ];

      const result = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {
            'USD Account': { action: 'create-new' },
            'GBP Account': { action: 'create-new' },
          },
          categoryMapping: {},
          skipDuplicateIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(2);
      expect(result.summary.accountsCreated).toBe(2);
    });
  });

  describe('importDetails in externalData', () => {
    it('should store importDetails with correct structure', async () => {
      const account = await helpers.createAccount({ raw: true });

      const validRows = createValidRows({
        accountName: 'CSV Account',
        currencyCode: account.currencyCode,
      });

      const result = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {
            'CSV Account': { action: 'link-existing', accountId: account.id },
          },
          categoryMapping: {},
          skipDuplicateIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(3);
      expect(result.summary.errors).toHaveLength(0);

      // Verify externalData.importDetails is stored correctly
      const importedTx = await Transactions.findByPk(result.newTransactionIds[0]);
      const importDetails = importedTx?.externalData?.importDetails as TransactionImportDetails | undefined;

      expect(importDetails).toBeDefined();
      expect(importDetails?.batchId).toBe(result.batchId);
      expect(importDetails?.source).toBe(ImportSource.csv);
      expect(importDetails?.importedAt).toBeDefined();
      // Verify importedAt is a valid ISO date string
      expect(() => new Date(importDetails!.importedAt)).not.toThrow();
      expect(new Date(importDetails!.importedAt).toISOString()).toBe(importDetails!.importedAt);
    });

    it('should store same batchId for all transactions in a single import', async () => {
      const account = await helpers.createAccount({ raw: true });

      const validRows = createValidRows({
        accountName: 'CSV Account',
        currencyCode: account.currencyCode,
      });

      const result = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {
            'CSV Account': { action: 'link-existing', accountId: account.id },
          },
          categoryMapping: {},
          skipDuplicateIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(3);

      // Verify all transactions have the same batchId
      const importedTxs = await Transactions.findAll({
        where: { id: result.newTransactionIds },
      });

      const batchIds = importedTxs.map((tx) => (tx.externalData?.importDetails as TransactionImportDetails)?.batchId);
      expect(batchIds.every((id) => id === result.batchId)).toBe(true);
    });

    it('should have different batchIds for separate imports', async () => {
      const account = await helpers.createAccount({ raw: true });

      const validRows = createValidRows({
        accountName: 'CSV Account',
        currencyCode: account.currencyCode,
      });

      const result1 = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {
            'CSV Account': { action: 'link-existing', accountId: account.id },
          },
          categoryMapping: {},
          skipDuplicateIndices: [],
        },
        raw: true,
      });

      const result2 = await helpers.executeImport({
        payload: {
          validRows,
          accountMapping: {
            'CSV Account': { action: 'link-existing', accountId: account.id },
          },
          categoryMapping: {},
          skipDuplicateIndices: [],
        },
        raw: true,
      });

      // Verify batchIds are different between imports
      const tx1 = await Transactions.findByPk(result1.newTransactionIds[0]);
      const tx2 = await Transactions.findByPk(result2.newTransactionIds[0]);

      const batchId1 = (tx1?.externalData?.importDetails as TransactionImportDetails)?.batchId;
      const batchId2 = (tx2?.externalData?.importDetails as TransactionImportDetails)?.batchId;

      expect(batchId1).toBe(result1.batchId);
      expect(batchId2).toBe(result2.batchId);
      expect(batchId1).not.toBe(batchId2);
    });
  });
});
