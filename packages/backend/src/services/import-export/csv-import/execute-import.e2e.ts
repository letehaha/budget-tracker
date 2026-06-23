import type {
  AccountMappingConfig,
  CategoryMappingConfig,
  ColumnMappingConfig,
  TagMappingConfig,
  TransactionImportDetails,
} from '@bt/shared/types';
import {
  AccountOptionValue,
  CategoryOptionValue,
  CurrencyOptionValue,
  ImportSource,
  TagOptionValue,
  TransactionTypeOptionValue,
} from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import Transactions from '@models/transactions.model';
import * as helpers from '@tests/helpers';
import { expectCsvImportCompleted, waitForCsvImportCompletion } from '@tests/helpers/import-export';
import { asUser, signUpSecondUser } from '@tests/helpers/share';

describe('Execute Import endpoint (async)', () => {
  // ---------------------------------------------------------------------------
  // CSV-content builders
  //
  // The execute step is now async: the request carries the raw `fileContent` +
  // `columnMapping` (NOT pre-parsed rows), the worker re-parses via the same
  // `parseValidRows` the interactive preview uses, then runs `executeImport`.
  // Tests therefore drive the endpoint exactly as the UI does — they build a CSV
  // file and a column mapping rather than constructing `ParsedTransactionRow[]`.
  // ---------------------------------------------------------------------------

  /** A single CSV data row. Optional fields fall back to safe column defaults. */
  interface CsvRow {
    date?: string;
    amount?: string;
    description?: string;
    category?: string;
    account?: string;
    currency?: string;
    type?: 'income' | 'expense';
    tags?: string;
    payee?: string;
  }

  const CSV_HEADERS = ['Date', 'Amount', 'Description', 'Category', 'Account', 'Currency', 'Type', 'Tags', 'Payee'];

  /**
   * Build a comma-delimited CSV `fileContent` from row objects. The header order
   * is fixed so the `buildColumnMapping` defaults line up with it.
   */
  const buildCsv = (rows: CsvRow[]): string => {
    const cell = (value: string | undefined) => value ?? '';
    const lines = [
      CSV_HEADERS.join(','),
      ...rows.map((row) =>
        [
          cell(row.date),
          cell(row.amount),
          cell(row.description),
          cell(row.category),
          cell(row.account),
          cell(row.currency),
          cell(row.type),
          cell(row.tags),
          cell(row.payee),
        ].join(','),
      ),
    ];
    return lines.join('\n');
  };

  /**
   * Column mapping matching {@link CSV_HEADERS}. Override pieces per test (e.g.
   * to use a single existing account/category/currency instead of a column).
   */
  const buildColumnMapping = (overrides: Partial<ColumnMappingConfig> = {}): ColumnMappingConfig => ({
    date: 'Date',
    amount: 'Amount',
    description: 'Description',
    category: { option: CategoryOptionValue.mapDataSourceColumn, columnName: 'Category' },
    currency: { option: CurrencyOptionValue.dataSourceColumn, columnName: 'Currency' },
    transactionType: {
      option: TransactionTypeOptionValue.dataSourceColumn,
      columnName: 'Type',
      incomeValues: ['income'],
      expenseValues: ['expense'],
    },
    account: { option: AccountOptionValue.dataSourceColumn, columnName: 'Account' },
    ...overrides,
  });

  /**
   * Enqueue an async CSV import and poll it to its terminal state. The first
   * status response is asserted to be a real progress envelope so a broken
   * enqueue fails fast (per project e2e guidance) instead of timing out the poll.
   */
  const runImport = async (payload: {
    fileContent: string;
    columnMapping?: ColumnMappingConfig;
    accountMapping: AccountMappingConfig;
    categoryMapping?: CategoryMappingConfig;
    tagMapping?: TagMappingConfig;
    skipDuplicateIndices?: number[];
    skipUnpriceableIndices?: number[];
    defaultAccountId?: string;
    defaultCategoryId?: string;
  }) => {
    const { jobId } = await helpers.executeImport({
      payload: {
        fileContent: payload.fileContent,
        delimiter: ',',
        columnMapping: payload.columnMapping ?? buildColumnMapping(),
        accountMapping: payload.accountMapping,
        categoryMapping: payload.categoryMapping ?? {},
        tagMapping: payload.tagMapping,
        skipDuplicateIndices: payload.skipDuplicateIndices ?? [],
        skipUnpriceableIndices: payload.skipUnpriceableIndices,
        defaultAccountId: payload.defaultAccountId,
        defaultCategoryId: payload.defaultCategoryId,
      },
      raw: true,
    });

    // Fail-fast: a broken enqueue must surface immediately, not as a 30s poll
    // timeout. The job id must be the documented `csv-import-<userId>-<uuid>`.
    expect(jobId).toBeTruthy();
    expect(jobId).toMatch(/^csv-import-/);

    // The very first status read must be a valid CsvImportProgress envelope for
    // this job. If the status route or enqueue is broken this throws now.
    const firstStatus = await helpers.getCsvImportStatus({ jobId, raw: true });
    expect(firstStatus.jobId).toBe(jobId);
    expect(['queued', 'running', 'completed', 'failed']).toContain(firstStatus.status);

    return { jobId, progress: await waitForCsvImportCompletion({ jobId }) };
  };

  // The three default rows reused across happy-path tests: two expenses and one
  // income, mirroring the original suite's `createValidRows`.
  const defaultRows = ({
    account = 'CSV Account',
    category = 'Test Category',
    currency = 'USD',
  }: {
    account?: string;
    category?: string;
    currency?: string;
  } = {}): CsvRow[] => [
    {
      date: '2024-01-15',
      amount: '100.50',
      description: 'Grocery shopping',
      category,
      account,
      currency,
      type: 'expense',
    },
    { date: '2024-01-16', amount: '50.00', description: 'Coffee shop', category, account, currency, type: 'expense' },
    { date: '2024-01-17', amount: '2500.00', description: 'Salary', account, currency, type: 'income' },
  ];

  describe('successful import', () => {
    it('should import transactions with existing account', async () => {
      const account = await helpers.createAccount({ raw: true });

      const { progress } = await runImport({
        fileContent: buildCsv(defaultRows({ account: 'CSV Account', currency: account.currencyCode })),
        accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
      });
      expectCsvImportCompleted(progress);
      const { summary } = progress;

      expect(summary.imported).toBe(3);
      expect(summary.skipped).toBe(0);
      expect(summary.accountsCreated).toBe(0);
      expect(summary.categoriesCreated).toBe(0);
      expect(summary.errors).toHaveLength(0);
      expect(summary.newTransactionIds).toHaveLength(3);
      expect(summary.batchId).toBeDefined();

      const transactions = await helpers.getTransactions({ raw: true });
      const createdTxs = transactions.filter((tx) => summary.newTransactionIds.includes(tx.id));
      expect(createdTxs).toHaveLength(3);
      expect(createdTxs.every((tx) => tx.accountId === account.id)).toBe(true);
    });

    it('should create new account when action is create-new', async () => {
      const accountsBefore = await helpers.getAccounts();

      const { progress } = await runImport({
        fileContent: buildCsv(defaultRows({ account: 'New Import Account', currency: 'USD' })),
        accountMapping: { 'New Import Account': { action: 'create-new' } },
      });
      expectCsvImportCompleted(progress);

      expect(progress.summary.imported).toBe(3);
      expect(progress.summary.accountsCreated).toBe(1);
      expect(progress.summary.errors).toHaveLength(0);
      expect(progress.summary.newTransactionIds).toHaveLength(3);

      const accountsAfter = await helpers.getAccounts();
      expect(accountsAfter.length).toBe(accountsBefore.length + 1);
      const newAccount = accountsAfter.find((a) => a.name === 'New Import Account');
      expect(newAccount).toBeDefined();
      expect(newAccount?.currencyCode).toBe('USD');
    });

    it('should create new category when action is create-new', async () => {
      const account = await helpers.createAccount({ raw: true });
      const categoriesBefore = await helpers.getCategoriesList();

      const { progress } = await runImport({
        fileContent: buildCsv(
          defaultRows({ account: 'CSV Account', category: 'New Import Category', currency: account.currencyCode }),
        ),
        accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
        categoryMapping: { 'New Import Category': { action: 'create-new' } },
      });
      expectCsvImportCompleted(progress);

      expect(progress.summary.imported).toBe(3);
      expect(progress.summary.categoriesCreated).toBe(1);
      expect(progress.summary.errors).toHaveLength(0);

      const categoriesAfter = await helpers.getCategoriesList();
      expect(categoriesAfter.length).toBe(categoriesBefore.length + 1);
      expect(categoriesAfter.find((c) => c.name === 'New Import Category')).toBeDefined();
    });

    it('should link to existing category', async () => {
      const account = await helpers.createAccount({ raw: true });
      const existingCategories = await helpers.getCategoriesList();
      let categoryId: string;
      if (existingCategories.length > 0) {
        categoryId = existingCategories[0]!.id;
      } else {
        const newCategory = await helpers.addCustomCategory({ name: 'Link Test Category', raw: true });
        categoryId = newCategory.id;
      }

      // Only the two rows that carry a category (the income "Salary" row omits one).
      const rows = defaultRows({
        account: 'CSV Account',
        category: 'CSV Category Name',
        currency: account.currencyCode,
      }).filter((row) => row.category !== undefined);

      const { progress } = await runImport({
        fileContent: buildCsv(rows),
        accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
        categoryMapping: { 'CSV Category Name': { action: 'link-existing', categoryId } },
      });
      expectCsvImportCompleted(progress);

      expect(progress.summary.imported).toBe(2);
      expect(progress.summary.categoriesCreated).toBe(0);
      expect(progress.summary.errors).toHaveLength(0);
    });

    it('should skip duplicate rows based on skipDuplicateIndices', async () => {
      const account = await helpers.createAccount({ raw: true });

      const { progress } = await runImport({
        fileContent: buildCsv(defaultRows({ account: 'CSV Account', currency: account.currencyCode })),
        accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
        skipDuplicateIndices: [2, 3], // Skip first two rows (rowIndex 2 and 3)
      });
      expectCsvImportCompleted(progress);

      expect(progress.summary.imported).toBe(1); // Only the third row
      expect(progress.summary.skipped).toBe(2);
      expect(progress.summary.newTransactionIds).toHaveLength(1);
    });

    it('should return empty result when all rows are skipped', async () => {
      const account = await helpers.createAccount({ raw: true });

      const { progress } = await runImport({
        fileContent: buildCsv(defaultRows({ account: 'CSV Account', currency: account.currencyCode })),
        accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
        skipDuplicateIndices: [2, 3, 4], // Skip all rows
      });
      expectCsvImportCompleted(progress);

      expect(progress.summary.imported).toBe(0);
      expect(progress.summary.skipped).toBe(3);
      expect(progress.summary.accountsCreated).toBe(0);
      expect(progress.summary.categoriesCreated).toBe(0);
      expect(progress.summary.newTransactionIds).toHaveLength(0);
    });

    it('should handle multiple accounts in single import', async () => {
      const accountsBefore = await helpers.getAccounts();

      const fileContent = buildCsv([
        {
          date: '2024-01-15',
          amount: '100.50',
          description: 'Transaction 1',
          account: 'Account A',
          currency: 'USD',
          type: 'expense',
        },
        {
          date: '2024-01-16',
          amount: '50.00',
          description: 'Transaction 2',
          account: 'Account B',
          currency: 'EUR',
          type: 'expense',
        },
      ]);

      const { progress } = await runImport({
        fileContent,
        accountMapping: {
          'Account A': { action: 'create-new' },
          'Account B': { action: 'create-new' },
        },
      });
      expectCsvImportCompleted(progress);

      expect(progress.summary.imported).toBe(2);
      expect(progress.summary.accountsCreated).toBe(2);

      const accountsAfter = await helpers.getAccounts();
      expect(accountsAfter.length).toBe(accountsBefore.length + 2);
      const accountA = accountsAfter.find((a) => a.name === 'Account A');
      const accountB = accountsAfter.find((a) => a.name === 'Account B');
      expect(accountA?.currencyCode).toBe('USD');
      expect(accountB?.currencyCode).toBe('EUR');
    });

    it('should handle multiple categories in single import', async () => {
      const account = await helpers.createAccount({ raw: true });
      const categoriesBefore = await helpers.getCategoriesList();

      const fileContent = buildCsv([
        {
          date: '2024-01-15',
          amount: '100.50',
          description: 'Transaction 1',
          category: 'Category A',
          account: 'CSV Account',
          currency: account.currencyCode,
          type: 'expense',
        },
        {
          date: '2024-01-16',
          amount: '50.00',
          description: 'Transaction 2',
          category: 'Category B',
          account: 'CSV Account',
          currency: account.currencyCode,
          type: 'expense',
        },
      ]);

      const { progress } = await runImport({
        fileContent,
        accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
        categoryMapping: {
          'Category A': { action: 'create-new' },
          'Category B': { action: 'create-new' },
        },
      });
      expectCsvImportCompleted(progress);

      expect(progress.summary.imported).toBe(2);
      expect(progress.summary.categoriesCreated).toBe(2);

      const categoriesAfter = await helpers.getCategoriesList();
      expect(categoriesAfter.length).toBe(categoriesBefore.length + 2);
      expect(categoriesAfter.find((c) => c.name === 'Category A')).toBeDefined();
      expect(categoriesAfter.find((c) => c.name === 'Category B')).toBeDefined();
    });

    it('should handle transactions without category', async () => {
      const account = await helpers.createAccount({ raw: true });

      const fileContent = buildCsv([
        {
          date: '2024-01-15',
          amount: '100.50',
          description: 'Transaction without category',
          account: 'CSV Account',
          currency: account.currencyCode,
          type: 'expense',
        },
      ]);

      const { progress } = await runImport({
        fileContent,
        accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
      });
      expectCsvImportCompleted(progress);

      expect(progress.summary.imported).toBe(1);
      expect(progress.summary.errors).toHaveLength(0);
    });
  });

  describe('single existing account/category fallbacks', () => {
    // When the user picks "assign all rows to a single existing account" in the
    // column-mapping step, the account column maps to an existing account id and
    // accountMapping is empty. The currency is derived from that account.
    it('should import rows mapped to a single existing account via column mapping', async () => {
      const account = await helpers.createAccount({ raw: true });

      // No Account/Currency columns referenced — both come from the chosen account.
      const fileContent = buildCsv([
        { date: '2024-01-15', amount: '100.50', description: 'Grocery shopping', type: 'expense' },
        { date: '2024-01-16', amount: '50.00', description: 'Coffee shop', type: 'expense' },
        { date: '2024-01-17', amount: '2500.00', description: 'Salary', type: 'income' },
      ]);

      const { progress } = await runImport({
        fileContent,
        columnMapping: buildColumnMapping({
          account: { option: AccountOptionValue.existingAccount, accountId: account.id },
          currency: { option: CurrencyOptionValue.existingCurrency, currencyCode: account.currencyCode },
          category: { option: CategoryOptionValue.mapDataSourceColumn, columnName: 'Category' },
        }),
        accountMapping: {},
      });
      expectCsvImportCompleted(progress);

      expect(progress.summary.imported).toBe(3);
      expect(progress.summary.errors).toHaveLength(0);
      expect(progress.summary.newTransactionIds).toHaveLength(3);

      const transactions = await helpers.getTransactions({ raw: true });
      const created = transactions.filter((tx) => progress.summary.newTransactionIds.includes(tx.id));
      expect(created).toHaveLength(3);
      expect(created.every((tx) => tx.accountId === account.id)).toBe(true);
    });

    // When the user picks "assign all rows to a single existing category", the
    // rows carry no category and defaultCategoryId fills it in. Without the
    // fallback the transactions would import with no category at all.
    it('should assign defaultCategoryId to rows with no category column', async () => {
      const account = await helpers.createAccount({ raw: true });
      const existingCategories = await helpers.getCategoriesList();
      const categoryId = existingCategories[0]!.id;

      const fileContent = buildCsv([
        {
          date: '2024-01-15',
          amount: '100.50',
          description: 'Grocery shopping',
          account: 'CSV Account',
          currency: account.currencyCode,
          type: 'expense',
        },
        {
          date: '2024-01-16',
          amount: '50.00',
          description: 'Coffee shop',
          account: 'CSV Account',
          currency: account.currencyCode,
          type: 'expense',
        },
        {
          date: '2024-01-17',
          amount: '2500.00',
          description: 'Salary',
          account: 'CSV Account',
          currency: account.currencyCode,
          type: 'income',
        },
      ]);

      const { progress } = await runImport({
        fileContent,
        // No category column mapped — the single chosen category fills every row.
        columnMapping: buildColumnMapping({
          category: { option: CategoryOptionValue.existingCategory, categoryId },
        }),
        accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
        defaultCategoryId: categoryId,
      });
      expectCsvImportCompleted(progress);

      expect(progress.summary.imported).toBe(3);
      expect(progress.summary.errors).toHaveLength(0);

      const transactions = await helpers.getTransactions({ raw: true });
      const created = transactions.filter((tx) => progress.summary.newTransactionIds.includes(tx.id));
      expect(created).toHaveLength(3);
      expect(created.every((tx) => tx.categoryId === categoryId)).toBe(true);
    });
  });

  describe('mixed account and category mappings', () => {
    it('should handle mixed account mappings (some new, some existing)', async () => {
      const accountsBefore = await helpers.getAccounts();
      const existingAccount = await helpers.createAccount({
        payload: { ...helpers.buildAccountPayload(), name: 'Existing Account' },
        raw: true,
      });

      const fileContent = buildCsv([
        {
          date: '2024-01-15',
          amount: '100.50',
          description: 'Transaction to new account',
          account: 'New Account A',
          currency: 'USD',
          type: 'expense',
        },
        {
          date: '2024-01-16',
          amount: '50.00',
          description: 'Transaction to existing account',
          account: 'CSV Existing Account',
          currency: existingAccount.currencyCode,
          type: 'expense',
        },
        {
          date: '2024-01-17',
          amount: '75.00',
          description: 'Transaction to another new account',
          account: 'New Account B',
          currency: 'EUR',
          type: 'income',
        },
      ]);

      const { progress } = await runImport({
        fileContent,
        accountMapping: {
          'New Account A': { action: 'create-new' },
          'CSV Existing Account': { action: 'link-existing', accountId: existingAccount.id },
          'New Account B': { action: 'create-new' },
        },
      });
      expectCsvImportCompleted(progress);

      expect(progress.summary.imported).toBe(3);
      expect(progress.summary.accountsCreated).toBe(2);
      expect(progress.summary.errors).toHaveLength(0);

      const accountsAfter = await helpers.getAccounts();
      expect(accountsAfter.length).toBe(accountsBefore.length + 3); // +1 existing, +2 import
      expect(accountsAfter.find((a) => a.name === 'New Account A')?.currencyCode).toBe('USD');
      expect(accountsAfter.find((a) => a.name === 'New Account B')?.currencyCode).toBe('EUR');

      const transactions = await helpers.getTransactions({ raw: true });
      const importedTxs = transactions.filter((tx) => progress.summary.newTransactionIds.includes(tx.id));
      const existingAccountTx = importedTxs.find((tx) => tx.note === 'Transaction to existing account');
      expect(existingAccountTx?.accountId).toBe(existingAccount.id);
    });

    it('should handle mixed category mappings (some new, some existing)', async () => {
      const account = await helpers.createAccount({ raw: true });
      const categoriesBefore = await helpers.getCategoriesList();

      let existingCategory1 = categoriesBefore[0];
      if (!existingCategory1) {
        existingCategory1 = await helpers.addCustomCategory({ name: 'Existing Cat 1', color: '#FF0000', raw: true });
      }
      const existingCategory2 = await helpers.addCustomCategory({
        name: 'Existing Cat 2',
        color: '#00FF00',
        raw: true,
      });

      const fileContent = buildCsv([
        {
          date: '2024-01-15',
          amount: '100.50',
          description: 'Transaction with new category',
          category: 'New Category A',
          account: 'CSV Account',
          currency: account.currencyCode,
          type: 'expense',
        },
        {
          date: '2024-01-16',
          amount: '50.00',
          description: 'Transaction with existing category 1',
          category: 'CSV Existing Cat 1',
          account: 'CSV Account',
          currency: account.currencyCode,
          type: 'expense',
        },
        {
          date: '2024-01-17',
          amount: '75.00',
          description: 'Transaction with another new category',
          category: 'New Category B',
          account: 'CSV Account',
          currency: account.currencyCode,
          type: 'income',
        },
        {
          date: '2024-01-18',
          amount: '30.00',
          description: 'Transaction with existing category 2',
          category: 'CSV Existing Cat 2',
          account: 'CSV Account',
          currency: account.currencyCode,
          type: 'expense',
        },
      ]);

      const { progress } = await runImport({
        fileContent,
        accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
        categoryMapping: {
          'New Category A': { action: 'create-new' },
          'CSV Existing Cat 1': { action: 'link-existing', categoryId: existingCategory1.id },
          'New Category B': { action: 'create-new' },
          'CSV Existing Cat 2': { action: 'link-existing', categoryId: existingCategory2.id },
        },
      });
      expectCsvImportCompleted(progress);

      expect(progress.summary.imported).toBe(4);
      expect(progress.summary.categoriesCreated).toBe(2);
      expect(progress.summary.errors).toHaveLength(0);

      const categoriesAfter = await helpers.getCategoriesList();
      expect(categoriesAfter.find((c) => c.name === 'New Category A')).toBeDefined();
      expect(categoriesAfter.find((c) => c.name === 'New Category B')).toBeDefined();

      const transactions = await helpers.getTransactions({ raw: true });
      const importedTxs = transactions.filter((tx) => progress.summary.newTransactionIds.includes(tx.id));
      expect(importedTxs.find((tx) => tx.note === 'Transaction with existing category 1')?.categoryId).toBe(
        existingCategory1.id,
      );
      expect(importedTxs.find((tx) => tx.note === 'Transaction with existing category 2')?.categoryId).toBe(
        existingCategory2.id,
      );
    });

    it('should reuse same category across multiple accounts', async () => {
      const fileContent = buildCsv([
        {
          date: '2024-01-15',
          amount: '100.50',
          description: 'Food expense from Account A',
          category: 'Food',
          account: 'Account A',
          currency: 'USD',
          type: 'expense',
        },
        {
          date: '2024-01-16',
          amount: '50.00',
          description: 'Food expense from Account B',
          category: 'Food',
          account: 'Account B',
          currency: 'USD',
          type: 'expense',
        },
        {
          date: '2024-01-17',
          amount: '75.00',
          description: 'Food expense from Account A again',
          category: 'Food',
          account: 'Account A',
          currency: 'USD',
          type: 'expense',
        },
      ]);

      const { progress } = await runImport({
        fileContent,
        accountMapping: {
          'Account A': { action: 'create-new' },
          'Account B': { action: 'create-new' },
        },
        categoryMapping: { Food: { action: 'create-new' } },
      });
      expectCsvImportCompleted(progress);

      expect(progress.summary.imported).toBe(3);
      expect(progress.summary.accountsCreated).toBe(2);
      expect(progress.summary.categoriesCreated).toBe(1); // Only ONE Food category

      const categoriesAfter = await helpers.getCategoriesList();
      expect(categoriesAfter.filter((c) => c.name === 'Food')).toHaveLength(1);

      const transactions = await helpers.getTransactions({ raw: true });
      const importedTxs = transactions.filter((tx) => progress.summary.newTransactionIds.includes(tx.id));
      expect(importedTxs).toHaveLength(3);
      expect([...new Set(importedTxs.map((tx) => tx.categoryId))]).toHaveLength(1);
      expect([...new Set(importedTxs.map((tx) => tx.accountId))]).toHaveLength(2);
    });

    it('should handle mix of transactions with and without categories', async () => {
      const account = await helpers.createAccount({ raw: true });

      const fileContent = buildCsv([
        {
          date: '2024-01-15',
          amount: '100.50',
          description: 'Transaction with category',
          category: 'New Category',
          account: 'CSV Account',
          currency: account.currencyCode,
          type: 'expense',
        },
        {
          date: '2024-01-16',
          amount: '50.00',
          description: 'Transaction without category',
          account: 'CSV Account',
          currency: account.currencyCode,
          type: 'expense',
        },
        {
          date: '2024-01-17',
          amount: '75.00',
          description: 'Another transaction with category',
          category: 'New Category',
          account: 'CSV Account',
          currency: account.currencyCode,
          type: 'income',
        },
      ]);

      const { progress } = await runImport({
        fileContent,
        accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
        categoryMapping: { 'New Category': { action: 'create-new' } },
      });
      expectCsvImportCompleted(progress);

      expect(progress.summary.imported).toBe(3);
      expect(progress.summary.categoriesCreated).toBe(1);
      expect(progress.summary.errors).toHaveLength(0);

      const transactions = await helpers.getTransactions({ raw: true });
      const importedTxs = transactions.filter((tx) => progress.summary.newTransactionIds.includes(tx.id));
      expect(importedTxs.find((tx) => tx.note === 'Transaction without category')?.categoryId).toBeNull();
      expect(importedTxs.find((tx) => tx.note === 'Transaction with category')?.categoryId).not.toBeNull();
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

      const fileContent = buildCsv([
        {
          date: '2024-01-15',
          amount: '100.50',
          description: 'Transaction 1',
          category: 'CSV Category 1',
          account: 'CSV Account 1',
          currency: account1.currencyCode,
          type: 'expense',
        },
        {
          date: '2024-01-16',
          amount: '50.00',
          description: 'Transaction 2',
          category: 'CSV Category 2',
          account: 'CSV Account 2',
          currency: account2.currencyCode,
          type: 'expense',
        },
      ]);

      const { progress } = await runImport({
        fileContent,
        accountMapping: {
          'CSV Account 1': { action: 'link-existing', accountId: account1.id },
          'CSV Account 2': { action: 'link-existing', accountId: account2.id },
        },
        categoryMapping: {
          'CSV Category 1': { action: 'link-existing', categoryId: category1.id },
          'CSV Category 2': { action: 'link-existing', categoryId: category2.id },
        },
      });
      expectCsvImportCompleted(progress);

      expect(progress.summary.imported).toBe(2);
      expect(progress.summary.accountsCreated).toBe(0);
      expect(progress.summary.categoriesCreated).toBe(0);
      expect(progress.summary.errors).toHaveLength(0);

      expect((await helpers.getAccounts()).length).toBe(accountsBefore.length);
      expect((await helpers.getCategoriesList()).length).toBe(categoriesBefore.length);
    });
  });

  describe('error handling — failed jobs', () => {
    // The controller only validates the request shape; mapping/ownership failures
    // happen inside the worker and surface as `status: 'failed'`, mirroring the
    // Wallet importer. The summary is never present on a failed job.

    it('fails the job when account mapping is missing', async () => {
      const { progress } = await runImport({
        fileContent: buildCsv(defaultRows({ account: 'Unknown Account' })),
        accountMapping: {}, // Missing mapping for 'Unknown Account'
      });
      expect(progress.status).toBe('failed');
      if (progress.status !== 'failed') throw new Error('unreachable');
      expect(progress.error).toMatch(/no mapping found/i);
    });

    it('fails the job when the linked account does not exist', async () => {
      const { progress } = await runImport({
        fileContent: buildCsv(defaultRows({ account: 'CSV Account' })),
        accountMapping: { 'CSV Account': { action: 'link-existing', accountId: generateRandomRecordId() } },
      });
      expect(progress.status).toBe('failed');
      if (progress.status !== 'failed') throw new Error('unreachable');
      expect(progress.error).toMatch(/not found/i);
    });

    it('fails the job when the linked category does not exist', async () => {
      const account = await helpers.createAccount({ raw: true });

      const { progress } = await runImport({
        fileContent: buildCsv(
          defaultRows({ account: 'CSV Account', category: 'Some Category', currency: account.currencyCode }),
        ),
        accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
        categoryMapping: { 'Some Category': { action: 'link-existing', categoryId: generateRandomRecordId() } },
      });
      expect(progress.status).toBe('failed');
      if (progress.status !== 'failed') throw new Error('unreachable');
      expect(progress.error).toMatch(/not found/i);
    });

    it('completes with an empty summary when the CSV has only a header row', async () => {
      // No data rows → the worker parses zero valid rows and completes with an
      // empty summary (not a failure).
      const { progress } = await runImport({
        fileContent: CSV_HEADERS.join(','),
        accountMapping: {},
      });
      expectCsvImportCompleted(progress);
      expect(progress.summary.imported).toBe(0);
      expect(progress.summary.skipped).toBe(0);
      expect(progress.summary.newTransactionIds).toHaveLength(0);
    });
  });

  describe('status endpoint', () => {
    it('returns 404 for an unknown job id', async () => {
      const response = await helpers.getCsvImportStatus({ jobId: 'no-such-csv-job' });
      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it("refuses to leak another user's job status (cross-user authZ)", async () => {
      const account = await helpers.createAccount({ raw: true });

      // User A enqueues a job — the status row is visible the moment it enqueues.
      const { jobId } = await helpers.executeImport({
        payload: {
          fileContent: buildCsv(defaultRows({ account: 'CSV Account', currency: account.currencyCode })),
          delimiter: ',',
          columnMapping: buildColumnMapping(),
          accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
          categoryMapping: {},
          skipDuplicateIndices: [],
        },
        raw: true,
      });
      expect(jobId).toBeTruthy();

      const otherUser = await signUpSecondUser();
      const statusAsOther = await asUser({
        cookies: otherUser.cookies,
        fn: () => helpers.getCsvImportStatus({ jobId }),
      });
      expect(statusAsOther.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });

  describe('transaction creation details', () => {
    it('should create transactions and return correct IDs', async () => {
      const account = await helpers.createAccount({ raw: true });
      const existingCategories = await helpers.getCategoriesList();
      let categoryId: string;
      if (existingCategories.length > 0) {
        categoryId = existingCategories[0]!.id;
      } else {
        const newCategory = await helpers.addCustomCategory({ name: 'Transaction Test Category', raw: true });
        categoryId = newCategory.id;
      }

      const fileContent = buildCsv([
        {
          date: '2024-01-15',
          amount: '100.50',
          description: 'Test transaction',
          category: 'CSV Category',
          account: 'CSV Account',
          currency: account.currencyCode,
          type: 'expense',
        },
      ]);

      const { progress } = await runImport({
        fileContent,
        accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
        categoryMapping: { 'CSV Category': { action: 'link-existing', categoryId } },
      });
      expectCsvImportCompleted(progress);

      expect(progress.summary.imported).toBe(1);
      expect(progress.summary.newTransactionIds).toHaveLength(1);
      expect(typeof progress.summary.newTransactionIds[0]).toBe('string');
      expect(progress.summary.newTransactionIds[0]).toBeTruthy();

      const transactions = await helpers.getTransactions({ raw: true });
      const createdTx = transactions.find((tx) => tx.id === progress.summary.newTransactionIds[0]);
      expect(createdTx).toBeDefined();
      expect(createdTx?.amount).toBe(100.5);
      expect(createdTx?.note).toBe('Test transaction');
      expect(createdTx?.accountId).toBe(account.id);
      expect(createdTx?.categoryId).toBe(categoryId);
    });

    it('should generate unique batchId for each import', async () => {
      const account = await helpers.createAccount({ raw: true });
      const fileContent = buildCsv(defaultRows({ account: 'CSV Account', currency: account.currencyCode }));
      const accountMapping = { 'CSV Account': { action: 'link-existing' as const, accountId: account.id } };

      const first = await runImport({ fileContent, accountMapping });
      const second = await runImport({ fileContent, accountMapping });
      expectCsvImportCompleted(first.progress);
      expectCsvImportCompleted(second.progress);

      expect(first.progress.summary.batchId).toBeDefined();
      expect(second.progress.summary.batchId).toBeDefined();
      expect(first.progress.summary.batchId).not.toBe(second.progress.summary.batchId);
    });
  });

  describe('currency handling', () => {
    it('should add currency to user currencies automatically', async () => {
      const fileContent = buildCsv([
        {
          date: '2024-01-15',
          amount: '100.50',
          description: 'EUR Transaction',
          account: 'EUR Account',
          currency: 'EUR',
          type: 'expense',
        },
      ]);

      const { progress } = await runImport({
        fileContent,
        accountMapping: { 'EUR Account': { action: 'create-new' } },
      });
      expectCsvImportCompleted(progress);

      expect(progress.summary.imported).toBe(1);
      expect(progress.summary.errors).toHaveLength(0);
    });

    it('should handle multiple currencies in single import', async () => {
      const fileContent = buildCsv([
        {
          date: '2024-01-15',
          amount: '100.50',
          description: 'USD Transaction',
          account: 'USD Account',
          currency: 'USD',
          type: 'expense',
        },
        {
          date: '2024-01-16',
          amount: '50.00',
          description: 'GBP Transaction',
          account: 'GBP Account',
          currency: 'GBP',
          type: 'expense',
        },
      ]);

      const { progress } = await runImport({
        fileContent,
        accountMapping: {
          'USD Account': { action: 'create-new' },
          'GBP Account': { action: 'create-new' },
        },
      });
      expectCsvImportCompleted(progress);

      expect(progress.summary.imported).toBe(2);
      expect(progress.summary.accountsCreated).toBe(2);
    });
  });

  describe('skipUnpriceableIndices', () => {
    it('should skip rows listed in skipUnpriceableIndices and not import them', async () => {
      const account = await helpers.createAccount({ raw: true });

      // rowIndices 2 and 3 are marked unpriceable; only rowIndex 4 imports.
      const { progress } = await runImport({
        fileContent: buildCsv(defaultRows({ account: 'CSV Account', currency: account.currencyCode })),
        accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
        skipUnpriceableIndices: [2, 3],
      });
      expectCsvImportCompleted(progress);

      expect(progress.summary.imported).toBe(1);
      expect(progress.summary.skipped).toBe(0);
      expect(progress.summary.skippedUnpriceable).toBe(2);
      expect(progress.summary.newTransactionIds).toHaveLength(1);
    });

    it('should skip both duplicate and unpriceable rows and report counts separately', async () => {
      const account = await helpers.createAccount({ raw: true });

      // rowIndex 2 → duplicate-skip; rowIndex 3 → unpriceable-skip; rowIndex 4 → imported.
      const { progress } = await runImport({
        fileContent: buildCsv(defaultRows({ account: 'CSV Account', currency: account.currencyCode })),
        accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
        skipDuplicateIndices: [2],
        skipUnpriceableIndices: [3],
      });
      expectCsvImportCompleted(progress);

      expect(progress.summary.imported).toBe(1);
      expect(progress.summary.skipped).toBe(1);
      expect(progress.summary.skippedUnpriceable).toBe(1);
      expect(progress.summary.newTransactionIds).toHaveLength(1);
    });

    it('should return skippedUnpriceable: 0 when skipUnpriceableIndices is omitted', async () => {
      const account = await helpers.createAccount({ raw: true });

      const { progress } = await runImport({
        fileContent: buildCsv(defaultRows({ account: 'CSV Account', currency: account.currencyCode })),
        accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
      });
      expectCsvImportCompleted(progress);

      expect(progress.summary.imported).toBe(3);
      expect(progress.summary.skipped).toBe(0);
      expect(progress.summary.skippedUnpriceable).toBe(0);
    });

    it('should import nothing and report full counts when all rows skipped via both lists', async () => {
      const account = await helpers.createAccount({ raw: true });

      const { progress } = await runImport({
        fileContent: buildCsv(defaultRows({ account: 'CSV Account', currency: account.currencyCode })),
        accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
        skipDuplicateIndices: [2],
        skipUnpriceableIndices: [3, 4],
      });
      expectCsvImportCompleted(progress);

      expect(progress.summary.imported).toBe(0);
      expect(progress.summary.skipped).toBe(1);
      expect(progress.summary.skippedUnpriceable).toBe(2);
      expect(progress.summary.newTransactionIds).toHaveLength(0);
    });
  });

  describe('importDetails in externalData', () => {
    it('should store importDetails with correct structure and a shared batchId', async () => {
      const account = await helpers.createAccount({ raw: true });

      const { progress } = await runImport({
        fileContent: buildCsv(defaultRows({ account: 'CSV Account', currency: account.currencyCode })),
        accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
      });
      expectCsvImportCompleted(progress);
      const { summary } = progress;

      expect(summary.imported).toBe(3);
      expect(summary.errors).toHaveLength(0);

      const importedTx = await Transactions.findByPk(summary.newTransactionIds[0]);
      const importDetails = importedTx?.externalData?.importDetails as TransactionImportDetails | undefined;
      expect(importDetails).toBeDefined();
      expect(importDetails?.batchId).toBe(summary.batchId);
      expect(importDetails?.source).toBe(ImportSource.csv);
      expect(importDetails?.importedAt).toBeDefined();
      expect(() => new Date(importDetails!.importedAt)).not.toThrow();
      expect(new Date(importDetails!.importedAt).toISOString()).toBe(importDetails!.importedAt);

      // Every transaction in the import shares the same batchId.
      const importedTxs = await Transactions.findAll({ where: { id: summary.newTransactionIds } });
      const batchIds = importedTxs.map((tx) => (tx.externalData?.importDetails as TransactionImportDetails)?.batchId);
      expect(batchIds.every((id) => id === summary.batchId)).toBe(true);
    });

    it('should have different batchIds for separate imports', async () => {
      const account = await helpers.createAccount({ raw: true });
      const fileContent = buildCsv(defaultRows({ account: 'CSV Account', currency: account.currencyCode }));
      const accountMapping = { 'CSV Account': { action: 'link-existing' as const, accountId: account.id } };

      const first = await runImport({ fileContent, accountMapping });
      const second = await runImport({ fileContent, accountMapping });
      expectCsvImportCompleted(first.progress);
      expectCsvImportCompleted(second.progress);

      const tx1 = await Transactions.findByPk(first.progress.summary.newTransactionIds[0]);
      const tx2 = await Transactions.findByPk(second.progress.summary.newTransactionIds[0]);
      const batchId1 = (tx1?.externalData?.importDetails as TransactionImportDetails)?.batchId;
      const batchId2 = (tx2?.externalData?.importDetails as TransactionImportDetails)?.batchId;

      expect(batchId1).toBe(first.progress.summary.batchId);
      expect(batchId2).toBe(second.progress.summary.batchId);
      expect(batchId1).not.toBe(batchId2);
    });
  });

  describe('tags import', () => {
    const tagsOf = async (transactionId: string): Promise<string[]> => {
      const list = await helpers.getTransactions({ includeTags: true, raw: true });
      const tx = list.find((item) => item.id === transactionId);
      return (tx?.tags ?? []).map((t) => t.name);
    };

    // A single tagged expense row, tag column mapped.
    const tagRow = ({
      account = 'CSV Account',
      currency = 'USD',
      description = 'Tagged purchase',
      tags,
    }: {
      account?: string;
      currency?: string;
      description?: string;
      tags?: string;
    }): string =>
      buildCsv([{ date: '2024-01-15', amount: '100.50', description, account, currency, type: 'expense', tags }]);

    const tagColumnMapping = () =>
      buildColumnMapping({ tags: { option: TagOptionValue.mapDataSourceColumn, columnName: 'Tags' } });

    it('creates a new tag and links it to the imported transaction', async () => {
      const account = await helpers.createAccount({ raw: true });

      const { progress } = await runImport({
        fileContent: tagRow({ currency: account.currencyCode, tags: 'NewTag' }),
        columnMapping: tagColumnMapping(),
        accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
        tagMapping: { NewTag: { action: 'create-new' } },
      });
      expectCsvImportCompleted(progress);

      expect(progress.summary.imported).toBe(1);
      expect(progress.summary.tagsCreated).toBe(1);
      expect(progress.summary.errors).toHaveLength(0);

      const createdTags = await helpers.getTags({ raw: true });
      expect(createdTags.map((t) => t.name)).toContain('NewTag');
      expect(await tagsOf(progress.summary.newTransactionIds[0]!)).toEqual(['NewTag']);
    });

    it('links an existing tag without creating a duplicate', async () => {
      const [account, existing] = await Promise.all([
        helpers.createAccount({ raw: true }),
        helpers.createTag({ payload: helpers.buildTagPayload({ name: 'Groceries' }), raw: true }),
      ]);

      const { progress } = await runImport({
        fileContent: tagRow({ currency: account.currencyCode, tags: 'Groceries' }),
        columnMapping: tagColumnMapping(),
        accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
        tagMapping: { Groceries: { action: 'link-existing', tagId: existing.id } },
      });
      expectCsvImportCompleted(progress);

      expect(progress.summary.imported).toBe(1);
      expect(progress.summary.tagsCreated).toBe(0);

      const allTags = await helpers.getTags({ raw: true });
      expect(allTags.filter((t) => t.name === 'Groceries')).toHaveLength(1);
      expect(await tagsOf(progress.summary.newTransactionIds[0]!)).toEqual(['Groceries']);
    });

    it('drops source values whose mapping is skip', async () => {
      const account = await helpers.createAccount({ raw: true });

      const { progress } = await runImport({
        // Comma-separated tags in one quoted cell — the parser splits them.
        fileContent: tagRow({ currency: account.currencyCode, tags: '"Keep,Drop"' }),
        columnMapping: tagColumnMapping(),
        accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
        tagMapping: {
          Keep: { action: 'create-new' },
          Drop: { action: 'skip' },
        },
      });
      expectCsvImportCompleted(progress);

      expect(progress.summary.imported).toBe(1);
      expect(progress.summary.tagsCreated).toBe(1);

      const allTags = await helpers.getTags({ raw: true });
      expect(allTags.map((t) => t.name)).not.toContain('Drop');
      expect(await tagsOf(progress.summary.newTransactionIds[0]!)).toEqual(['Keep']);
    });

    it('unions imported tags with the payee default tags', async () => {
      // createTransaction extracts the payee from the description when this
      // setting is on — the e2e-reachable way to link a payee via execute.
      await helpers.updateUserSettings({ settings: { locale: 'en', payeeExtractionUsesDescription: true } });

      const [account, defaultTag] = await Promise.all([
        helpers.createAccount({ raw: true }),
        helpers.createTag({ payload: helpers.buildTagPayload({ name: 'PayeeDefault' }), raw: true }),
      ]);
      await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Spotify', defaultTagIds: [defaultTag.id] }),
        raw: true,
      });

      const { progress } = await runImport({
        fileContent: tagRow({ currency: account.currencyCode, description: 'Spotify', tags: 'Imported' }),
        columnMapping: tagColumnMapping(),
        accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
        tagMapping: { Imported: { action: 'create-new' } },
      });
      expectCsvImportCompleted(progress);

      expect(progress.summary.imported).toBe(1);
      // Both the imported tag and the payee's default tag must be present.
      expect((await tagsOf(progress.summary.newTransactionIds[0]!)).toSorted()).toEqual(['Imported', 'PayeeDefault']);
    });

    it('fails the job when a tag mapping link-existing id does not belong to the user', async () => {
      const account = await helpers.createAccount({ raw: true });

      const { progress } = await runImport({
        fileContent: tagRow({ currency: account.currencyCode, tags: 'Ghost' }),
        columnMapping: tagColumnMapping(),
        accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
        tagMapping: { Ghost: { action: 'link-existing', tagId: generateRandomRecordId() } },
      });
      expect(progress.status).toBe('failed');
      if (progress.status !== 'failed') throw new Error('unreachable');
      expect(progress.error).toMatch(/not found/i);
    });
  });

  describe('categories import', () => {
    const categoryIdOf = async (transactionId: string): Promise<string | null | undefined> => {
      const list = await helpers.getTransactions({ raw: true });
      return list.find((item) => item.id === transactionId)?.categoryId;
    };

    const categoryRow = ({
      account = 'CSV Account',
      currency = 'USD',
      category,
    }: {
      account?: string;
      currency?: string;
      category?: string;
    }): string =>
      buildCsv([
        {
          date: '2024-01-15',
          amount: '100.50',
          description: 'Categorised purchase',
          category,
          account,
          currency,
          type: 'expense',
        },
      ]);

    it('reuses an existing same-named category case-insensitively for create-new and does not count it', async () => {
      const existingName = `Repeat Cat ${generateRandomRecordId()}`;
      const [account, seeded] = await Promise.all([
        helpers.createAccount({ raw: true }),
        helpers.addCustomCategory({ name: existingName, color: '#AABBCC', raw: true }),
      ]);
      expect(seeded.name).toBe(existingName);
      expect(seeded.id).toBeTruthy();

      const categoriesBefore = await helpers.getCategoriesList();
      const lowercased = existingName.toLowerCase();

      const { progress } = await runImport({
        fileContent: categoryRow({ currency: account.currencyCode, category: lowercased }),
        accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
        categoryMapping: { [lowercased]: { action: 'create-new' } },
      });
      expectCsvImportCompleted(progress);

      expect(progress.summary.imported).toBe(1);
      expect(progress.summary.categoriesCreated).toBe(0); // reuse, not a creation
      expect(progress.summary.errors).toHaveLength(0);

      expect(await categoryIdOf(progress.summary.newTransactionIds[0]!)).toBe(seeded.id);
      expect((await helpers.getCategoriesList()).length).toBe(categoriesBefore.length);
    });

    it('treats create-new source values with ILIKE wildcards as literals, creating new categories', async () => {
      // '50%' as an ILIKE pattern would match this decoy; as a literal it must not.
      const decoyName = `50% off ${generateRandomRecordId()}`;
      const [account, decoy] = await Promise.all([
        helpers.createAccount({ raw: true }),
        helpers.addCustomCategory({ name: decoyName, color: '#AABBCC', raw: true }),
      ]);
      expect(decoy.id).toBeTruthy();

      const categoriesBefore = await helpers.getCategoriesList();

      const { progress } = await runImport({
        fileContent: categoryRow({ currency: account.currencyCode, category: '50%' }),
        accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
        categoryMapping: { '50%': { action: 'create-new' } },
      });
      expectCsvImportCompleted(progress);

      expect(progress.summary.imported).toBe(1);
      expect(progress.summary.categoriesCreated).toBe(1); // genuine insert, not the decoy
      expect(progress.summary.errors).toHaveLength(0);

      const linkedCategoryId = await categoryIdOf(progress.summary.newTransactionIds[0]!);
      expect(linkedCategoryId).toBeTruthy();
      expect(linkedCategoryId).not.toBe(decoy.id);

      const categoriesAfter = await helpers.getCategoriesList();
      expect(categoriesAfter.length).toBe(categoriesBefore.length + 1);
      expect(categoriesAfter.find((c) => c.id === linkedCategoryId)?.name).toBe('50%');
    });
  });

  describe('partial failure — best-effort import', () => {
    // The worker re-parses the file with `parseValidRows`, which rejects an
    // unparseable date or blank account as an INVALID row before `executeImport`
    // ever runs — so those never become per-row `summary.errors`. A genuine
    // per-row Phase-5 DB failure requires a `createTransaction` error that no
    // HTTP-reachable input can force here. What this test pins down is the
    // best-effort contract that IS observable over HTTP: good rows import, the
    // claimed-imported ids are actually persisted, and `summary.errors` is always
    // a well-shaped array on a completed job.
    it('imports the good rows and always returns a well-shaped errors array', async () => {
      const account = await helpers.createAccount({ raw: true });

      const fileContent = buildCsv([
        {
          date: '2024-02-01',
          amount: '100.00',
          description: 'Good row before',
          account: 'CSV Account',
          currency: account.currencyCode,
          type: 'expense',
        },
        {
          date: '2024-02-03',
          amount: '300.00',
          description: 'Good row after',
          account: 'CSV Account',
          currency: account.currencyCode,
          type: 'expense',
        },
      ]);

      const { progress } = await runImport({
        fileContent,
        accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
      });
      expectCsvImportCompleted(progress);

      // Both good rows import; errors is always an array on a completed job.
      expect(progress.summary.imported).toBe(2);
      expect(Array.isArray(progress.summary.errors)).toBe(true);
      for (const entry of progress.summary.errors) {
        expect(typeof entry.error).toBe('string');
        expect(typeof entry.rowIndex).toBe('number');
      }
      expect(progress.summary.newTransactionIds).toHaveLength(2);

      // Honesty: claimed-imported rows are actually persisted.
      const transactions = await helpers.getTransactions({ raw: true });
      const persisted = transactions.filter((tx) => progress.summary.newTransactionIds.includes(tx.id));
      expect(persisted).toHaveLength(2);
      expect(persisted.length).toBe(progress.summary.imported);
    });
  });
});
