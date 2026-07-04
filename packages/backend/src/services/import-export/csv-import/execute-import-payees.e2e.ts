import type { AccountMappingConfig, CategoryMappingConfig, ColumnMappingConfig } from '@bt/shared/types';
import {
  AccountOptionValue,
  CATEGORIZATION_MODE,
  CategoryOptionValue,
  CurrencyOptionValue,
  TransactionTypeOptionValue,
} from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { expectCsvImportCompleted, waitForCsvImportCompletion } from '@tests/helpers/import-export';

// -----------------------------------------------------------------------------
// CSV importer – auto-create Payee on import (columnMapping.payee).
//
// Drives the CSV execute endpoints as the UI does: CSV `fileContent` + a
// `columnMapping` that maps "Payee", enqueue, poll to terminal, then assert on
// `summary.payeesCreated` and the persisted `payeeId`/`categoryId` (Docker e2e
// swallows console.*, so response fields are the only signal). Sibling to
// `execute-import.e2e.ts`, kept separate for the payee surface.
// -----------------------------------------------------------------------------

describe('CSV Execute Import – payee auto-create', () => {
  /** A single CSV data row. Optional fields fall back to empty column defaults. */
  interface CsvRow {
    date?: string;
    amount?: string;
    description?: string;
    category?: string;
    account?: string;
    currency?: string;
    type?: 'income' | 'expense';
    payee?: string;
  }

  const CSV_HEADERS = ['Date', 'Amount', 'Description', 'Category', 'Account', 'Currency', 'Type', 'Payee'];

  const buildCsv = (rows: CsvRow[]): string => {
    const cell = (value: string | undefined) => value ?? '';
    return [
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
          cell(row.payee),
        ].join(','),
      ),
    ].join('\n');
  };

  /**
   * Column mapping matching {@link CSV_HEADERS}. `payee` is NOT mapped by default
   * so omitting the override exercises the "no payee column mapped" gate; pass
   * `{ payee: 'Payee' }` to map it.
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
   * Enqueue an async CSV import and poll to terminal. Asserts the first status
   * is a real progress envelope so a broken enqueue fails fast instead of a 30s
   * poll timeout.
   */
  const runImport = async (payload: {
    fileContent: string;
    columnMapping: ColumnMappingConfig;
    accountMapping: AccountMappingConfig;
    categoryMapping?: CategoryMappingConfig;
    defaultCategoryId?: string;
  }) => {
    const { jobId } = await helpers.executeImport({
      payload: {
        fileContent: payload.fileContent,
        delimiter: ',',
        columnMapping: payload.columnMapping,
        accountMapping: payload.accountMapping,
        categoryMapping: payload.categoryMapping ?? {},
        skipDuplicateIndices: [],
        defaultCategoryId: payload.defaultCategoryId,
      },
      raw: true,
    });

    // Fail-fast: a broken enqueue must surface here, not as a poll timeout.
    expect(jobId).toBeTruthy();
    expect(jobId).toMatch(/^csv-import-/);

    const firstStatus = await helpers.getCsvImportStatus({ jobId, raw: true });
    expect(firstStatus.jobId).toBe(jobId);
    expect(['queued', 'running', 'completed', 'failed']).toContain(firstStatus.status);

    return { jobId, progress: await waitForCsvImportCompletion({ jobId }) };
  };

  /** Fetch the persisted transaction created by this import, matched by note. */
  const txByNote = async (note: string) => {
    const list = await helpers.getTransactions({ raw: true });
    return list.find((tx) => tx.note === note);
  };

  const expenseRow = ({
    amount = '100.50',
    description,
    account,
    currency,
    category,
    payee,
  }: {
    amount?: string;
    description: string;
    account: string;
    currency: string;
    category?: string;
    payee?: string;
  }): CsvRow => ({ date: '2024-01-15', amount, description, category, account, currency, type: 'expense', payee });

  it('scenario 1 – creates a new Payee per distinct brand-new name (payeesCreated === 2)', async () => {
    const account = await helpers.createAccount({ raw: true });
    const payeeA = `Payee One ${generateRandomRecordId()}`;
    const payeeB = `Payee Two ${generateRandomRecordId()}`;

    const { progress } = await runImport({
      fileContent: buildCsv([
        expenseRow({ description: 'row-a', account: 'CSV Account', currency: account.currencyCode, payee: payeeA }),
        expenseRow({ description: 'row-b', account: 'CSV Account', currency: account.currencyCode, payee: payeeB }),
      ]),
      columnMapping: buildColumnMapping({ payee: 'Payee' }),
      accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
    });
    expectCsvImportCompleted(progress);

    expect(progress.summary.imported).toBe(2);
    expect(progress.summary.payeesCreated).toBe(2);
    expect(progress.summary.errors).toHaveLength(0);

    const txA = await txByNote('row-a');
    const txB = await txByNote('row-b');
    expect(txA?.payeeId).toBeTruthy();
    expect(txB?.payeeId).toBeTruthy();
    // The two distinct names produced two distinct Payees.
    expect(txA?.payeeId).not.toBe(txB?.payeeId);

    // Both Payees are persisted under their source names.
    const payees = await helpers.listPayees({ raw: true });
    const names = payees.map((p) => p.name);
    expect(names).toContain(payeeA);
    expect(names).toContain(payeeB);
  });

  it('scenario 2 – links a normalized case/punctuation variant to an existing Payee without counting it', async () => {
    const account = await helpers.createAccount({ raw: true });
    const token = generateRandomRecordId();
    const existingName = `Acme Corp ${token}`;
    const existingPayee = await helpers.createPayee({
      payload: helpers.buildPayeePayload({ name: existingName }),
      raw: true,
    });

    // Case + punctuation variant: normalizePayeeName lowercases, strips
    // punctuation, collapses whitespace, so this resolves to `existingPayee`
    // rather than creating a second Payee.
    const variant = `acme corp. ${token}!`;

    const { progress } = await runImport({
      fileContent: buildCsv([
        expenseRow({
          description: 'variant-row',
          account: 'CSV Account',
          currency: account.currencyCode,
          payee: variant,
        }),
      ]),
      columnMapping: buildColumnMapping({ payee: 'Payee' }),
      accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
    });
    expectCsvImportCompleted(progress);

    expect(progress.summary.imported).toBe(1);
    expect(progress.summary.payeesCreated).toBe(0); // linked, not created
    expect(progress.summary.errors).toHaveLength(0);

    const tx = await txByNote('variant-row');
    expect(tx?.payeeId).toBe(existingPayee.id);
  });

  it('scenario 3 – leaves payeeId null and payeesCreated 0 when no payee column is mapped', async () => {
    const account = await helpers.createAccount({ raw: true });

    // The Payee cells carry values, but the column is NOT mapped — the mapping
    // is the only gate, so nothing is read and no Payee is created/linked.
    const { progress } = await runImport({
      fileContent: buildCsv([
        expenseRow({
          description: 'unmapped-row',
          account: 'CSV Account',
          currency: account.currencyCode,
          payee: `Ignored Payee ${generateRandomRecordId()}`,
        }),
      ]),
      columnMapping: buildColumnMapping(), // no `payee` override
      accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
    });
    expectCsvImportCompleted(progress);

    expect(progress.summary.imported).toBe(1);
    expect(progress.summary.payeesCreated).toBe(0);

    const tx = await txByNote('unmapped-row');
    expect(tx?.payeeId).toBeNull();
  });

  it('scenario 4 – dedupes repeated payee names: one create, both rows link the same Payee', async () => {
    const account = await helpers.createAccount({ raw: true });
    const payeeName = `Dupe Payee ${generateRandomRecordId()}`;

    const { progress } = await runImport({
      fileContent: buildCsv([
        expenseRow({ description: 'dupe-1', account: 'CSV Account', currency: account.currencyCode, payee: payeeName }),
        expenseRow({ description: 'dupe-2', account: 'CSV Account', currency: account.currencyCode, payee: payeeName }),
      ]),
      columnMapping: buildColumnMapping({ payee: 'Payee' }),
      accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
    });
    expectCsvImportCompleted(progress);

    expect(progress.summary.imported).toBe(2);
    expect(progress.summary.payeesCreated).toBe(1); // counted once

    const tx1 = await txByNote('dupe-1');
    const tx2 = await txByNote('dupe-2');
    expect(tx1?.payeeId).toBeTruthy();
    expect(tx1?.payeeId).toBe(tx2?.payeeId);
  });

  it('scenario 5 – mapped category wins over an enforce-mode payee default; payee default applies only when no category is mapped', async () => {
    const account = await helpers.createAccount({ raw: true });
    const token = generateRandomRecordId();

    // categoryA = the enforce-mode payee's default; categoryB = the per-row
    // mapped category. Distinct, unique names so they don't collide with seeded
    // defaults (which would read as 0 created / hang polls).
    const [categoryA, categoryB] = await Promise.all([
      helpers.addCustomCategory({ name: `Cat A ${token}`, color: '#111111', raw: true }),
      helpers.addCustomCategory({ name: `Cat B ${token}`, color: '#222222', raw: true }),
    ]);

    const payeeName = `Enforce Payee ${token}`;
    const payee = await helpers.createPayee({
      payload: helpers.buildPayeePayload({
        name: payeeName,
        defaultCategoryId: categoryA.id,
        categorizationMode: CATEGORIZATION_MODE.enforce,
      }),
      raw: true,
    });

    const catBSource = `Cat B ${token}`;

    const { progress } = await runImport({
      fileContent: buildCsv([
        // Row X: same payee AND a mapped category → mapped category must win.
        expenseRow({
          description: 'precedence-mapped',
          account: 'CSV Account',
          currency: account.currencyCode,
          category: catBSource,
          payee: payeeName,
        }),
        // Row Y: same payee, NO mapped category → payee enforce default applies.
        expenseRow({
          description: 'precedence-payee-default',
          account: 'CSV Account',
          currency: account.currencyCode,
          payee: payeeName,
        }),
      ]),
      columnMapping: buildColumnMapping({ payee: 'Payee' }),
      accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
      categoryMapping: { [catBSource]: { action: 'link-existing', categoryId: categoryB.id } },
    });
    expectCsvImportCompleted(progress);

    expect(progress.summary.imported).toBe(2);
    expect(progress.summary.payeesCreated).toBe(0); // pre-existing payee, linked
    expect(progress.summary.categoriesCreated).toBe(0); // categoryB linked, not created
    expect(progress.summary.errors).toHaveLength(0);

    const mappedTx = await txByNote('precedence-mapped');
    const payeeDefaultTx = await txByNote('precedence-payee-default');

    // Both rows link the same enforce-mode payee.
    expect(mappedTx?.payeeId).toBe(payee.id);
    expect(payeeDefaultTx?.payeeId).toBe(payee.id);

    // Row X: the explicitly mapped category beats the payee enforce default.
    expect(mappedTx?.categoryId).toBe(categoryB.id);
    // Row Y: with no mapped category, the payee enforce default is applied.
    expect(payeeDefaultTx?.categoryId).toBe(categoryA.id);
  });

  it('scenario 6 – leaves payeeLocked false on an import-created Payee so the user can still override it', async () => {
    const account = await helpers.createAccount({ raw: true });
    const payeeName = `Unlocked Payee ${generateRandomRecordId()}`;

    const { progress } = await runImport({
      fileContent: buildCsv([
        expenseRow({
          description: 'unlocked-row',
          account: 'CSV Account',
          currency: account.currencyCode,
          payee: payeeName,
        }),
      ]),
      columnMapping: buildColumnMapping({ payee: 'Payee' }),
      accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
    });
    expectCsvImportCompleted(progress);

    expect(progress.summary.imported).toBe(1);
    expect(progress.summary.payeesCreated).toBe(1);
    expect(progress.summary.errors).toHaveLength(0);

    const tx = await txByNote('unlocked-row');
    expect(tx?.payeeId).toBeTruthy();
    // An import-assigned Payee is advisory: payeeLocked stays false so the user
    // (or a later payee rule) can re-resolve the merchant.
    expect(tx?.payeeLocked).toBe(false);
  });

  describe('error handling – payee failures', () => {
    // Payees are resolved before the per-row loop, so these failures abort the
    // whole batch and surface as `status: 'failed'`. Docker e2e swallows
    // console.*, so `progress.error` is the only signal.

    it('fails the job when the mapped payee column is absent from the CSV headers', async () => {
      const account = await helpers.createAccount({ raw: true });
      // A mapped payee column absent from CSV_HEADERS must be rejected up front
      // (parse-valid-rows throws csvImport.payeeColumnNotFound), not silently
      // imported with no payee data.
      const missingColumn = `Missing Payee Column ${generateRandomRecordId()}`;

      const { progress } = await runImport({
        fileContent: buildCsv([
          expenseRow({
            description: 'missing-payee-col',
            account: 'CSV Account',
            currency: account.currencyCode,
            payee: 'ignored',
          }),
        ]),
        columnMapping: buildColumnMapping({ payee: missingColumn }),
        accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
      });

      expect(progress.status).toBe('failed');
      if (progress.status !== 'failed') throw new Error('unreachable');
      expect(progress.error).toMatch(/payee column.*not found/i);
      // The bad column name is echoed so the UI can point at the exact mapping.
      expect(progress.error).toContain(missingColumn);

      // Nothing was imported.
      expect(await txByNote('missing-payee-col')).toBeUndefined();
    });

    it('fails the job with a clean validation error when a payee name exceeds the column limit', async () => {
      // Payees.name is varchar(200): a longer brand-new name must surface as a
      // ValidationError (from create-payees-if-needed, before the row loop), not
      // Postgres's raw "value too long..." text.
      const account = await helpers.createAccount({ raw: true });
      const tooLongPayeeName = `Overlong ${generateRandomRecordId()} ${'A'.repeat(250)}`;

      const { progress } = await runImport({
        fileContent: buildCsv([
          expenseRow({
            description: 'overlong-payee',
            account: 'CSV Account',
            currency: account.currencyCode,
            payee: tooLongPayeeName,
          }),
        ]),
        columnMapping: buildColumnMapping({ payee: 'Payee' }),
        accountMapping: { 'CSV Account': { action: 'link-existing', accountId: account.id } },
      });

      expect(progress.status).toBe('failed');
      if (progress.status !== 'failed') throw new Error('unreachable');
      expect(progress.error).toMatch(/payee name.*too long|too long.*payee/i);
      expect(progress.error).not.toMatch(/character varying|sequelize/i);

      // The batch aborted before the row loop, so nothing was imported.
      expect(await txByNote('overlong-payee')).toBeUndefined();
    });
  });
});
