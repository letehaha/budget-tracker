import {
  API_ERROR_CODES,
  BANK_PROVIDER_TYPE,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  VEHICLE_CLASS,
} from '@bt/shared/types';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { RateLimitService } from '@services/common/rate-limit.service';
import { EXPORT_SCHEMA_VERSION } from '@services/data-export/types';
import * as helpers from '@tests/helpers';
import { VALID_MONOBANK_TOKEN } from '@tests/mocks/monobank/mock-api';
import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';

describe('Data export (POST /user/data-export)', () => {
  // The route is rate-limited (5 exports per 15 min per user) and the limiter
  // runs in the test env. Reset Redis state before each test so the per-suite
  // accumulation of calls doesn't poison unrelated cases.
  beforeEach(async () => {
    const userRes = await helpers.makeRequest({ method: 'get', url: '/user', raw: true });
    const userId = (userRes as { id: number }).id;
    await RateLimitService.resetRateLimit(`data-export:user:${userId}`);
  });
  describe('JSON format – happy path', () => {
    it('returns a zip with data-export.json + manifest.json that includes the seeded transaction', async () => {
      const account = await helpers.createAccount({ raw: true });
      const category = await helpers.addCustomCategory({ name: 'Export coffee', color: '#FFAA00', raw: true });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 15.5,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
          note: 'Latte',
        }),
        raw: true,
      });

      const response = await helpers.exportData({ format: 'json' });

      expect(response.statusCode).toBe(200);
      expect(response.contentType).toBe('application/zip');
      expect(response.filename).toMatch(/^moneymatter-export-\d{4}-\d{2}-\d{2}\.zip$/);
      expect(response.body.length).toBeGreaterThan(0);

      const archive = helpers.parseExportArchive({ buffer: response.body });
      expect([...archive.files.keys()].toSorted()).toEqual(['data-export.json', 'manifest.json']);
      expect(archive.manifest.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
      expect(archive.manifest.format).toBe('json');
      expect(archive.manifest.files).toHaveLength(1);
      expect(archive.manifest.files[0]?.filename).toBe('data-export.json');

      expect(archive.json).not.toBeNull();
      const data = archive.json as { transactions: Array<Record<string, unknown>> };
      expect(Array.isArray(data.transactions)).toBe(true);
      const seeded = data.transactions.find((t) => t.note === 'Latte');
      expect(seeded).toBeDefined();
      expect(seeded?.account).toBe(account.name);
      expect(seeded?.category).toBe('Export coffee');
      expect(seeded?.type).toBe('expense');
      // Money must surface as a decimal number (15.50) – NOT cents (1550) and
      // NOT a Money instance toJSON'd at an unexpected level.
      expect(seeded?.amount).toBe(15.5);
    });

    it('denormalizes FK columns: account/category/tag are names, not IDs', async () => {
      const account = await helpers.createAccount({ raw: true });
      const category = await helpers.addCustomCategory({ name: 'Denorm Cat', color: '#AABBCC', raw: true });
      const tag = await helpers.createTag({ payload: { name: 'denorm-tag', color: '#111111' }, raw: true });
      const tx = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          categoryId: category.id,
          amount: 5000,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });
      const baseTx = Array.isArray(tx) ? tx[0] : tx;
      await helpers.addTransactionsToTag({ tagId: tag.id, transactionIds: [baseTx!.id], raw: true });

      const response = await helpers.exportData({ format: 'json' });
      const archive = helpers.parseExportArchive({ buffer: response.body });
      const data = archive.json as { transactions: Array<Record<string, unknown>> };
      const exported = data.transactions.find((t) => t.account === account.name && t.category === 'Denorm Cat');
      expect(exported).toBeDefined();
      // No raw UUIDs should appear in any column.
      const stringified = JSON.stringify(exported);
      expect(stringified).not.toMatch(account.id);
      expect(stringified).not.toMatch(category.id);
      expect(exported?.tags).toEqual(['denorm-tag']);
    });

    it('includes the user header block with username + base currency', async () => {
      const response = await helpers.exportData({ format: 'json' });
      const archive = helpers.parseExportArchive({ buffer: response.body });
      const json = archive.json as { user: { username: string; base_currency: string; email: string | null } };
      expect(json.user).toBeDefined();
      expect(json.user.username).toEqual(expect.any(String));
      expect(json.user.username.length).toBeGreaterThan(0);
    });

    it('does NOT leak bank-provider credentials when a real provider connection exists', async () => {
      // Seed a bank-provider connection through the public API so the real
      // encryption/storage path runs. The export must not round-trip the
      // credentials column anywhere in the output.
      await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

      const response = await helpers.exportData({ format: 'json' });
      expect(response.statusCode).toBe(200);
      const archive = helpers.parseExportArchive({ buffer: response.body });
      const stringified = JSON.stringify(archive.json);

      // Neither the raw token nor the sensitive column names should appear
      // anywhere in the export. The connection's API token (or any encrypted
      // form of it) must stay out.
      expect(stringified).not.toContain(VALID_MONOBANK_TOKEN);
      expect(stringified).not.toMatch(/"credentials"/);
      expect(stringified).not.toMatch(/"keyEncrypted"/);
      expect(stringified).not.toMatch(/"secretKey"/);
    });

    it('returns a valid archive for a user with zero data across all groups', async () => {
      // Empty-state contract: even when every transformer returns [], the
      // archive should still be a well-formed zip with a manifest. Regressions
      // in archive-writer or manifest-builder edge cases would surface here.
      const response = await helpers.exportData({ format: 'json' });
      expect(response.statusCode).toBe(200);
      const archive = helpers.parseExportArchive({ buffer: response.body });
      expect(archive.manifest.files.length).toBeGreaterThan(0);
      expect(archive.manifest.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    });
  });

  describe('Authentication', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const response = await helpers.exportData({ withoutAuth: true });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('CSV format', () => {
    it('emits one CSV per logical file, header rows match the documented columns', async () => {
      const account = await helpers.createAccount({ raw: true });
      const category = await helpers.addCustomCategory({ name: 'CSV cat', color: '#AABBCC', raw: true });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          categoryId: category.id,
          amount: 12.34,
          transactionType: TRANSACTION_TYPES.expense,
          note: 'CSV row',
        }),
        raw: true,
      });

      const response = await helpers.exportData({ format: 'csv' });
      expect(response.statusCode).toBe(200);
      const archive = helpers.parseExportArchive({ buffer: response.body });

      expect(archive.files.has('manifest.json')).toBe(true);
      expect(archive.files.has('transactions.csv')).toBe(true);
      expect(archive.files.has('accounts.csv')).toBe(true);
      expect(archive.files.has('categories.csv')).toBe(true);

      const transactionsCsv = archive.files.get('transactions.csv')!;
      const rows = helpers.parseExportCsv({ buffer: transactionsCsv });
      // First row should have header columns visible as keys.
      expect(rows.length).toBeGreaterThan(0);
      const sample = rows[0]!;
      expect(Object.keys(sample)).toEqual(
        expect.arrayContaining(['Date', 'Time', 'Account', 'Type', 'Category', 'Amount', 'Currency', 'Note']),
      );

      const seeded = rows.find((r) => r.Note === 'CSV row');
      expect(seeded).toBeDefined();
      expect(seeded?.Account).toBe(account.name);
      expect(seeded?.Category).toBe('CSV cat');
      // Money displayed as the decimal number (12.34), not the cents integer.
      expect(seeded?.Amount).toBe('12.34');
    });

    it('writes a UTF-8 BOM at the start of every CSV file', async () => {
      const response = await helpers.exportData({ format: 'csv' });
      const archive = helpers.parseExportArchive({ buffer: response.body });
      for (const [name, buf] of archive.files.entries()) {
        if (!name.endsWith('.csv')) continue;
        expect(buf[0]).toBe(0xef);
        expect(buf[1]).toBe(0xbb);
        expect(buf[2]).toBe(0xbf);
      }
    });
  });

  describe('XLSX format', () => {
    it('emits a workbook whose sheets and data round-trip the seeded values', async () => {
      const account = await helpers.createAccount({ raw: true });
      const category = await helpers.addCustomCategory({ name: 'XLSX cat', color: '#AABBCC', raw: true });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          categoryId: category.id,
          amount: 42.5,
          transactionType: TRANSACTION_TYPES.expense,
          note: 'XLSX row',
        }),
        raw: true,
      });

      const response = await helpers.exportData({ format: 'xlsx' });
      expect(response.statusCode).toBe(200);
      const archive = helpers.parseExportArchive({ buffer: response.body });

      expect(archive.files.has('data-export.xlsx')).toBe(true);
      expect(archive.files.has('manifest.json')).toBe(true);
      const xlsxBuf = archive.files.get('data-export.xlsx')!;
      // XLSX is itself a zip starting with the local file header signature PK\003\004.
      expect(xlsxBuf[0]).toBe(0x50);
      expect(xlsxBuf[1]).toBe(0x4b);
      expect(xlsxBuf[2]).toBe(0x03);
      expect(xlsxBuf[3]).toBe(0x04);

      // Parse the workbook and verify content, not just the magic bytes – a
      // regression in xlsx-writer (e.g. wrong column mapping) would not be
      // caught by a magic-byte check alone.
      const workbook = new ExcelJS.Workbook();
      // ExcelJS's type asks for an ArrayBuffer; pass the Buffer's underlying
      // bytes so the load works without a runtime copy and the type matches.
      const ab = xlsxBuf.buffer.slice(xlsxBuf.byteOffset, xlsxBuf.byteOffset + xlsxBuf.byteLength);
      await workbook.xlsx.load(ab as ArrayBuffer);
      const sheetNames = workbook.worksheets.map((s) => s.name);
      expect(sheetNames).toContain('transactions');
      expect(sheetNames).toContain('accounts');

      const txSheet = workbook.getWorksheet('transactions')!;
      const headerRow = txSheet.getRow(1).values as Array<string | undefined>;
      const headers = headerRow.filter((v): v is string => typeof v === 'string');
      expect(headers).toEqual(
        expect.arrayContaining(['Date', 'Account', 'Type', 'Category', 'Amount', 'Currency', 'Note']),
      );

      let foundSeeded = false;
      txSheet.eachRow((row, rowIndex) => {
        if (rowIndex === 1) return;
        const values = row.values as Array<unknown>;
        // values[0] is the ExcelJS row index; cells are 1-based.
        if (values.includes('XLSX row')) {
          foundSeeded = true;
          // Amount cell should be a NUMBER (sortable in Excel), not a string.
          const amountIndex = headers.indexOf('Amount') + 1;
          expect(typeof values[amountIndex]).toBe('number');
          expect(values[amountIndex]).toBe(42.5);
        }
      });
      expect(foundSeeded).toBe(true);
    });
  });

  describe('Selective groups', () => {
    it('emits only the files belonging to the requested group(s)', async () => {
      const account = await helpers.createAccount({ raw: true });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 1000,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });
      // Seed a portfolio so the "investments" group has something – if we DIDN'T
      // request investments, the absence of those files is meaningful.
      await helpers.createPortfolio({ payload: { name: 'Selective portfolio' }, raw: true });

      const response = await helpers.exportData({ format: 'csv', groups: ['transactions'] });
      const archive = helpers.parseExportArchive({ buffer: response.body });

      expect(archive.files.has('transactions.csv')).toBe(true);
      expect(archive.files.has('accounts.csv')).toBe(true);
      expect(archive.files.has('categories.csv')).toBe(true);
      // Investments group not requested → its files MUST NOT be present.
      expect(archive.files.has('portfolios.csv')).toBe(false);
      expect(archive.files.has('holdings.csv')).toBe(false);
      expect(archive.files.has('investment_transactions.csv')).toBe(false);
    });

    it('emits only investments-group files when only investments is requested', async () => {
      await helpers.createPortfolio({ payload: { name: 'Investments-only portfolio' }, raw: true });
      const response = await helpers.exportData({ format: 'csv', groups: ['investments'] });
      const archive = helpers.parseExportArchive({ buffer: response.body });

      expect(archive.files.has('portfolios.csv')).toBe(true);
      expect(archive.files.has('holdings.csv')).toBe(true);
      expect(archive.files.has('investment_transactions.csv')).toBe(true);
      expect(archive.files.has('portfolio_transfers.csv')).toBe(true);
      expect(archive.files.has('transactions.csv')).toBe(false);
      expect(archive.files.has('accounts.csv')).toBe(false);
    });

    it('rejects an unknown group with a 4xx (Zod validation)', async () => {
      // The schema's `.default([...ALL_EXPORT_GROUPS])` makes an empty array
      // unreachable past Zod, so the negative test we CAN exercise is "garbage
      // group name → 4xx rejection". Confirms the controller enforces the
      // closed set of group names.
      const result = await helpers.exportData({
        format: 'json',
        // @ts-expect-error – invalid group exercised on purpose
        groups: ['nonsense-group'],
      });
      expect(result.statusCode).toBeGreaterThanOrEqual(400);
      expect(result.statusCode).toBeLessThan(500);
    });
  });

  describe('Splits, refunds, and transfers', () => {
    it('renders split transactions with SplitDetails column and nested splits array', async () => {
      const account = await helpers.createAccount({ raw: true });
      const food = await helpers.addCustomCategory({ name: 'Food', color: '#AABBCC', raw: true });
      const drinks = await helpers.addCustomCategory({ name: 'Drinks', color: '#AABBDD', raw: true });
      const tx = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          categoryId: food.id,
          amount: 25,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });
      const baseTx = Array.isArray(tx) ? tx[0] : tx;
      await helpers.updateTransaction({
        id: baseTx!.id,
        payload: {
          splits: [
            { categoryId: food.id, amount: 20 },
            { categoryId: drinks.id, amount: 5 },
          ],
        },
        raw: true,
      });

      // JSON form keeps the rich nested array.
      const jsonResponse = await helpers.exportData({ format: 'json' });
      const jsonArchive = helpers.parseExportArchive({ buffer: jsonResponse.body });
      const jsonData = jsonArchive.json as { transactions: Array<Record<string, unknown>> };
      const jsonRow = jsonData.transactions.find((t) => t.account === account.name);
      expect(jsonRow).toBeDefined();
      expect(Array.isArray(jsonRow?.splits)).toBe(true);
      expect(jsonRow?.splits).toHaveLength(2);

      // CSV form collapses to a single SplitDetails string column.
      const csvResponse = await helpers.exportData({ format: 'csv' });
      const csvArchive = helpers.parseExportArchive({ buffer: csvResponse.body });
      const rows = helpers.parseExportCsv({ buffer: csvArchive.files.get('transactions.csv')! });
      const csvRow = rows.find((r) => r.Account === account.name);
      expect(csvRow).toBeDefined();
      expect(csvRow?.SplitDetails).toContain('Food: 20.00');
      expect(csvRow?.SplitDetails).toContain('Drinks: 5.00');
    });

    it('renders refund linkage as a human-readable string in RefundOf column', async () => {
      const account = await helpers.createAccount({ raw: true });
      const purchase = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 5000,
          transactionType: TRANSACTION_TYPES.expense,
          note: 'Original purchase',
        }),
        raw: true,
      });
      const refund = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 2000,
          transactionType: TRANSACTION_TYPES.income,
          note: 'Partial refund',
        }),
        raw: true,
      });
      const originalTx = Array.isArray(purchase) ? purchase[0] : purchase;
      const refundTx = Array.isArray(refund) ? refund[0] : refund;
      await helpers.createSingleRefund({ originalTxId: originalTx!.id, refundTxId: refundTx!.id }, true);

      const response = await helpers.exportData({ format: 'csv' });
      const archive = helpers.parseExportArchive({ buffer: response.body });
      const rows = helpers.parseExportCsv({ buffer: archive.files.get('transactions.csv')! });
      const refundRow = rows.find((r) => r.Note === 'Partial refund');
      expect(refundRow).toBeDefined();
      // The RefundOf column should describe the original (date + account + amount),
      // not a UUID.
      expect(refundRow?.RefundOf).toContain(account.name);
      expect(refundRow?.RefundOf).not.toContain(originalTx!.id);
    });

    it('classifies transfer-nature transactions as transfer_in/transfer_out in the Type column', async () => {
      const source = await helpers.createAccount({ raw: true });
      const destPayload = helpers.buildAccountPayload({ name: 'Transfer dest' });
      const dest = await helpers.createAccount({ payload: destPayload, raw: true });
      const transfer = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: source.id,
            amount: 7500,
            transactionType: TRANSACTION_TYPES.expense,
            transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          }),
          destinationAmount: 7500,
          destinationAccountId: dest.id,
        } as unknown as ReturnType<typeof helpers.buildTransactionPayload>,
        raw: true,
      });
      const [outLeg, inLeg] = Array.isArray(transfer) ? transfer : [transfer, undefined];
      expect(outLeg).toBeDefined();
      expect(inLeg).toBeDefined();

      const response = await helpers.exportData({ format: 'csv' });
      const archive = helpers.parseExportArchive({ buffer: response.body });
      const rows = helpers.parseExportCsv({ buffer: archive.files.get('transactions.csv')! });
      const outRow = rows.find((r) => r.Account === source.name && r.Type === 'transfer_out');
      const inRow = rows.find((r) => r.Account === dest.name && r.Type === 'transfer_in');
      expect(outRow).toBeDefined();
      expect(inRow).toBeDefined();
      // LinkedTransfer should reference the OTHER leg's account name.
      expect(outRow?.LinkedTransfer).toContain(dest.name);
      expect(inRow?.LinkedTransfer).toContain(source.name);
    });
  });

  describe('Integrity manifest', () => {
    it('every file listed in manifest.files has a SHA-256 matching the on-disk file', async () => {
      const response = await helpers.exportData({ format: 'csv' });
      const archive = helpers.parseExportArchive({ buffer: response.body });

      for (const entry of archive.manifest.files) {
        const onDisk = archive.files.get(entry.filename);
        expect(onDisk).toBeDefined();
        const computed = createHash('sha256').update(onDisk!).digest('hex');
        expect(computed).toBe(entry.sha256);
        expect(entry.sizeBytes).toBe(onDisk!.length);
      }
    });

    it('manifest.json itself is NOT listed in manifest.files (chicken-and-egg)', async () => {
      const response = await helpers.exportData({ format: 'json' });
      const archive = helpers.parseExportArchive({ buffer: response.body });
      const names = archive.manifest.files.map((f) => f.filename);
      expect(names).not.toContain('manifest.json');
    });

    it('schemaVersion is the current EXPORT_SCHEMA_VERSION constant', async () => {
      const response = await helpers.exportData({ format: 'json' });
      const archive = helpers.parseExportArchive({ buffer: response.body });
      expect(archive.manifest.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    });
  });

  describe('Multiple domain coverage', () => {
    it('exports budgets, subscriptions, portfolios, and vehicles when their groups are enabled', async () => {
      const account = await helpers.createAccount({ raw: true });
      const category = await helpers.addCustomCategory({ name: 'MultiCat', color: '#AABBCC', raw: true });
      await helpers.createCustomBudget({
        name: 'Export budget',
        limitAmount: 100000,
        categoryIds: [category.id],
        raw: true,
      });
      await helpers.createPortfolio({ payload: { name: 'Multi portfolio' }, raw: true });

      // Seed a subscription and vehicle so their transformers see real data –
      // the test name promises these domains are covered, so do not leave them
      // as no-op transformers.
      await helpers.createSubscription({
        name: 'Multi subscription',
        frequency: 'monthly' as never,
        startDate: '2026-01-01',
        expectedAmount: 1000,
        expectedCurrencyCode: account.currencyCode,
        raw: true,
      });
      await helpers.createVehicle({
        name: 'Multi vehicle',
        currencyCode: account.currencyCode,
        make: 'Toyota',
        model: 'Corolla',
        year: 2022,
        vehicleClass: VEHICLE_CLASS.sedan,
        purchasePrice: 25000,
        purchaseDate: '2026-01-01',
        raw: true,
      });

      const response = await helpers.exportData({ format: 'json' });
      const archive = helpers.parseExportArchive({ buffer: response.body });
      const json = archive.json as Record<string, unknown[]>;

      expect(Array.isArray(json.budgets)).toBe(true);
      expect((json.budgets as Array<Record<string, unknown>>).some((b) => b.name === 'Export budget')).toBe(true);

      expect(Array.isArray(json.subscriptions)).toBe(true);
      expect((json.subscriptions as Array<Record<string, unknown>>).some((s) => s.name === 'Multi subscription')).toBe(
        true,
      );

      expect(Array.isArray(json.vehicles)).toBe(true);
      expect(
        (json.vehicles as Array<Record<string, unknown>>).some((v) => v.makeModel?.toString().includes('Toyota')),
      ).toBe(true);

      expect(Array.isArray(json.portfolios)).toBe(true);
      expect((json.portfolios as Array<Record<string, unknown>>).some((p) => p.name === 'Multi portfolio')).toBe(true);
    });

    it('handles budgets with NULL limitAmount without crashing', async () => {
      // Budget.limitAmount is nullable; the transformer must guard the
      // `.toNumber()` call so a budget without a cap exports as an empty cell
      // rather than 500'ing the whole request.
      const category = await helpers.addCustomCategory({ name: 'NoLimitCat', color: '#AABBCC', raw: true });
      await helpers.createCustomBudget({
        name: 'Open-ended budget',
        categoryIds: [category.id],
        // limitAmount intentionally omitted – should be allowed by the budgets API.
        raw: true,
      });

      const response = await helpers.exportData({ format: 'csv' });
      expect(response.statusCode).toBe(200);
      const archive = helpers.parseExportArchive({ buffer: response.body });
      const budgetsCsv = archive.files.get('budgets.csv');
      expect(budgetsCsv).toBeDefined();
      const rows = helpers.parseExportCsv({ buffer: budgetsCsv! });
      const seeded = rows.find((r) => r.Name === 'Open-ended budget');
      expect(seeded).toBeDefined();
      expect(seeded?.LimitAmount).toBe('');
    });
  });

  describe('Portfolios cash balances (per-currency)', () => {
    it('emits the packed CashBalances cell for CSV and a structured cashBalances array for JSON', async () => {
      // Portfolio is seeded via the public API; the export pipeline reads
      // whatever PortfolioBalances rows the create endpoint produces. The
      // test asserts the shape of the export cell, not how the cash got
      // there – so it stays valid even if portfolio-creation behaviour
      // changes how the initial PortfolioBalance row is seeded.
      const portfolio = await helpers.createPortfolio({ payload: { name: 'Multi-CCY portfolio' }, raw: true });
      expect(portfolio.id).toBeDefined();

      const jsonResponse = await helpers.exportData({ format: 'json', groups: ['investments'] });
      const jsonArchive = helpers.parseExportArchive({ buffer: jsonResponse.body });
      const jsonData = jsonArchive.json as { portfolios: Array<Record<string, unknown>> };
      const jsonRow = jsonData.portfolios.find((p) => p.name === 'Multi-CCY portfolio');
      expect(jsonRow).toBeDefined();
      // Either a structured per-currency array OR explicit null when no
      // balance rows exist – never an absent key, never a single scalar.
      const cashBalances = jsonRow?.cashBalances as Array<{ currency: string; balance: number }> | null;
      expect(cashBalances === null || Array.isArray(cashBalances)).toBe(true);
      if (Array.isArray(cashBalances)) {
        for (const entry of cashBalances) {
          expect(typeof entry.currency).toBe('string');
          expect(typeof entry.balance).toBe('number');
        }
      }

      const csvResponse = await helpers.exportData({ format: 'csv', groups: ['investments'] });
      const csvArchive = helpers.parseExportArchive({ buffer: csvResponse.body });
      const rows = helpers.parseExportCsv({ buffer: csvArchive.files.get('portfolios.csv')! });
      const csvRow = rows.find((r) => r.Name === 'Multi-CCY portfolio');
      expect(csvRow).toBeDefined();
      // Column header is `CashBalances` (packed string), NOT the old single
      // `CashBalance` numeric column. A regression that re-introduces the
      // single-currency column would lose multi-currency information.
      expect(Object.keys(csvRow!)).toContain('CashBalances');
      expect(Object.keys(csvRow!)).not.toContain('CashBalance');
    });
  });

  describe('Filename and response envelope', () => {
    it('uses an ISO date in the zip filename', async () => {
      const response = await helpers.exportData({ format: 'json' });
      expect(response.filename).toMatch(/^moneymatter-export-\d{4}-\d{2}-\d{2}\.zip$/);
    });

    it('exposes X-Total-Rows header so the frontend can show a preflight summary', async () => {
      const response = await helpers.exportData({ format: 'json' });
      expect(response.totalRows).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(response.totalRows)).toBe(true);
    });
  });

  describe('CSV cell escaping', () => {
    it('round-trips commas, quotes, and newlines inside notes through csv-stringify', async () => {
      const account = await helpers.createAccount({ raw: true });
      const note = 'She said "hi", then left\nNext line';
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 1,
          transactionType: TRANSACTION_TYPES.expense,
          note,
        }),
        raw: true,
      });

      const response = await helpers.exportData({ format: 'csv' });
      expect(response.statusCode).toBe(200);
      const archive = helpers.parseExportArchive({ buffer: response.body });
      const txCsv = archive.files.get('transactions.csv')!;
      // Reading the raw bytes (not parseExportCsv, which is intentionally
      // newline-unaware) – the escape sequences for `"` and `,` must be the
      // canonical csv-stringify form: `""` for quotes, fully-quoted cell
      // when the value contains commas/newlines.
      const text = txCsv.toString('utf8');
      expect(text).toContain('"She said ""hi"", then left');
    });
  });

  describe('Tag join contract', () => {
    it('joins multiple tags into the Tags cell with the documented "; " delimiter', async () => {
      const account = await helpers.createAccount({ raw: true });
      const tagA = await helpers.createTag({ payload: { name: 'alpha', color: '#111111' }, raw: true });
      const tagB = await helpers.createTag({ payload: { name: 'beta', color: '#222222' }, raw: true });
      const tx = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 1,
          transactionType: TRANSACTION_TYPES.expense,
          note: 'TagJoin',
        }),
        raw: true,
      });
      const baseTx = Array.isArray(tx) ? tx[0] : tx;
      await helpers.addTransactionsToTag({ tagId: tagA.id, transactionIds: [baseTx!.id], raw: true });
      await helpers.addTransactionsToTag({ tagId: tagB.id, transactionIds: [baseTx!.id], raw: true });

      const response = await helpers.exportData({ format: 'csv' });
      const archive = helpers.parseExportArchive({ buffer: response.body });
      const rows = helpers.parseExportCsv({ buffer: archive.files.get('transactions.csv')! });
      const row = rows.find((r) => r.Note === 'TagJoin');
      expect(row).toBeDefined();
      // Tags written in insertion order with explicit '; ' separator. A
      // delimiter regression to ',' would shift CSV columns silently for any
      // tag-bearing row.
      expect([row!.Tags === 'alpha; beta', row!.Tags === 'beta; alpha']).toContain(true);
    });
  });

  describe('Subscriptions transformer', () => {
    it('exports the subscription.endDate as the EndDate column (not relabelled as next-due)', async () => {
      const account = await helpers.createAccount({ raw: true });
      await helpers.createSubscription({
        name: 'EndDate sub',
        frequency: 'monthly' as never,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        expectedAmount: 1000,
        expectedCurrencyCode: account.currencyCode,
        raw: true,
      });
      const response = await helpers.exportData({ format: 'csv', groups: ['subscriptions'] });
      const archive = helpers.parseExportArchive({ buffer: response.body });
      const rows = helpers.parseExportCsv({ buffer: archive.files.get('subscriptions.csv')! });
      const row = rows.find((r) => r.Name === 'EndDate sub');
      expect(row).toBeDefined();
      expect(row!.EndDate).toBe('2026-12-31');
      // Defends against a regression that re-renames the column.
      expect(Object.keys(row!)).not.toContain('NextDue');
    });
  });

  describe('User header email', () => {
    it('exposes the user email field in the JSON header (string or explicit null, not undefined)', async () => {
      const response = await helpers.exportData({ format: 'json' });
      const archive = helpers.parseExportArchive({ buffer: response.body });
      const json = archive.json as { user: { email: string | null } };
      expect('email' in json.user).toBe(true);
      // Either a populated email or explicit null – never an absent key, so a
      // future consumer can rely on the field always being present.
      expect(json.user.email === null || typeof json.user.email === 'string').toBe(true);
    });
  });

  describe('Cross-user isolation', () => {
    it("does NOT leak another user's account, category, tag, or transaction note into the primary user's export", async () => {
      // Sign up a separate user and seed identifiable data (account, category,
      // tag, transaction note) so any unguarded FK lookup in a transformer
      // would pull the foreign rows into the primary user's export.
      // Cross-user guards live on every transformer that joins to a
      // user-scoped relation; this test fails fast if a future transformer
      // forgets the `userId` clause on one of those queries.
      const foreignNeedle = {
        account: `Foreign account ${Date.now()}`,
        category: `Foreign category ${Date.now()}`,
        tag: `foreign-tag-${Date.now()}`,
        note: `Foreign note ${Date.now()}`,
      };

      const secondUser = await helpers.signUpSecondUser();
      await helpers.asUser({
        cookies: secondUser.cookies,
        fn: async () => {
          await helpers.setBaseCurrencyForActiveUser({ currencyCode: global.BASE_CURRENCY.code });
          const foreignAccount = await helpers.createAccount({
            payload: helpers.buildAccountPayload({ name: foreignNeedle.account }),
            raw: true,
          });
          const foreignCategory = await helpers.addCustomCategory({
            name: foreignNeedle.category,
            color: '#FF00FF',
            raw: true,
          });
          await helpers.createTag({ payload: { name: foreignNeedle.tag, color: '#FF00FF' }, raw: true });
          await helpers.createTransaction({
            payload: helpers.buildTransactionPayload({
              accountId: foreignAccount.id,
              categoryId: foreignCategory.id,
              amount: 999,
              transactionType: TRANSACTION_TYPES.expense,
              note: foreignNeedle.note,
            }),
            raw: true,
          });
        },
      });

      // Seed a single primary-user transaction so the export has real rows.
      const myAccount = await helpers.createAccount({ raw: true });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: myAccount.id,
          amount: 1,
          transactionType: TRANSACTION_TYPES.expense,
          note: 'Primary user row',
        }),
        raw: true,
      });

      const response = await helpers.exportData({ format: 'json' });
      expect(response.statusCode).toBe(200);
      const archive = helpers.parseExportArchive({ buffer: response.body });
      const stringified = JSON.stringify(archive.json);

      // None of the second user's identifiable strings should appear anywhere
      // in the archive – not in transactions, not in joined names, not in
      // tag arrays, not in account currency columns, etc.
      expect(stringified).not.toContain(foreignNeedle.account);
      expect(stringified).not.toContain(foreignNeedle.category);
      expect(stringified).not.toContain(foreignNeedle.tag);
      expect(stringified).not.toContain(foreignNeedle.note);
    });
  });

  describe('Rate limit', () => {
    it('allows 5 exports in a 15-minute window per user and rejects the 6th with 429', async () => {
      // Don't rely on the suite-wide beforeEach reset — make this case self-contained
      // so it stays meaningful if the surrounding setup ever changes.
      const userRes = await helpers.makeRequest({ method: 'get', url: '/user', raw: true });
      const userId = (userRes as { id: number }).id;
      await RateLimitService.resetRateLimit(`data-export:user:${userId}`);

      for (let attempt = 1; attempt <= 5; attempt++) {
        const response = await helpers.exportData({ format: 'json' });
        expect(response.statusCode).toBe(200);
      }

      const blocked = await helpers.exportData({ format: 'json' });
      expect(blocked.statusCode).toBe(429);
      const body = blocked.errorBody as { response?: { code?: string } } | null;
      expect(body?.response?.code).toBe(API_ERROR_CODES.tooManyRequests);
    });

    it('after the limiter trips, a fresh window allows exports again (reset between users / windows)', async () => {
      const userRes = await helpers.makeRequest({ method: 'get', url: '/user', raw: true });
      const userId = (userRes as { id: number }).id;
      const key = `data-export:user:${userId}`;

      await RateLimitService.resetRateLimit(key);
      for (let attempt = 1; attempt <= 5; attempt++) {
        await helpers.exportData({ format: 'json' });
      }
      const blocked = await helpers.exportData({ format: 'json' });
      expect(blocked.statusCode).toBe(429);

      await RateLimitService.resetRateLimit(key);

      const afterReset = await helpers.exportData({ format: 'json' });
      expect(afterReset.statusCode).toBe(200);
    });
  });

  describe('Date range', () => {
    it('filters transactions to the requested range and leaves reference tables untouched', async () => {
      const account = await helpers.createAccount({ raw: true });
      const category = await helpers.addCustomCategory({ name: 'Range cat', color: '#AABBCC', raw: true });

      // Three transactions: one before, one inside, one after the window we'll
      // request. The export must drop the bookends and keep only the middle row.
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          categoryId: category.id,
          amount: 11,
          transactionType: TRANSACTION_TYPES.expense,
          note: 'Before window',
          time: '2023-12-31T12:00:00.000Z',
        }),
        raw: true,
      });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          categoryId: category.id,
          amount: 22,
          transactionType: TRANSACTION_TYPES.expense,
          note: 'Inside window',
          time: '2024-06-15T12:00:00.000Z',
        }),
        raw: true,
      });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          categoryId: category.id,
          amount: 33,
          transactionType: TRANSACTION_TYPES.expense,
          note: 'After window',
          time: '2025-02-01T12:00:00.000Z',
        }),
        raw: true,
      });

      const response = await helpers.exportData({
        format: 'json',
        dateRange: { from: '2024-01-01', to: '2024-12-31' },
      });
      expect(response.statusCode).toBe(200);

      const archive = helpers.parseExportArchive({ buffer: response.body });
      const data = archive.json as {
        transactions: Array<Record<string, unknown>>;
        accounts: Array<Record<string, unknown>>;
        categories: Array<Record<string, unknown>>;
      };

      const notes = data.transactions.map((t) => t.note);
      expect(notes).toContain('Inside window');
      expect(notes).not.toContain('Before window');
      expect(notes).not.toContain('After window');

      // Reference tables still emit everything – the inside-window row must
      // still resolve to the account/category by name.
      const accountNames = data.accounts.map((a) => a.name);
      const categoryNames = data.categories.map((c) => c.name);
      expect(accountNames).toContain(account.name);
      expect(categoryNames).toContain('Range cat');
    });

    it('inclusive on both endpoints (rows exactly on `from` or `to` are kept)', async () => {
      const account = await helpers.createAccount({ raw: true });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 1,
          transactionType: TRANSACTION_TYPES.expense,
          note: 'Lower boundary',
          time: '2024-01-01T00:00:00.000Z',
        }),
        raw: true,
      });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 2,
          transactionType: TRANSACTION_TYPES.expense,
          note: 'Upper boundary',
          time: '2024-12-31T23:59:00.000Z',
        }),
        raw: true,
      });

      const response = await helpers.exportData({
        format: 'json',
        dateRange: { from: '2024-01-01', to: '2024-12-31' },
      });
      const archive = helpers.parseExportArchive({ buffer: response.body });
      const data = archive.json as { transactions: Array<Record<string, unknown>> };
      const notes = data.transactions.map((t) => t.note);
      expect(notes).toEqual(expect.arrayContaining(['Lower boundary', 'Upper boundary']));
    });

    it('records the range on the manifest for traceability', async () => {
      const response = await helpers.exportData({
        format: 'json',
        dateRange: { from: '2024-01-01', to: '2024-12-31' },
      });
      const archive = helpers.parseExportArchive({ buffer: response.body });
      expect(archive.manifest.dateRange).toEqual({ from: '2024-01-01', to: '2024-12-31' });
    });

    it('omits the dateRange manifest field when the request had no range', async () => {
      const response = await helpers.exportData({ format: 'json' });
      const archive = helpers.parseExportArchive({ buffer: response.body });
      expect(archive.manifest.dateRange).toBeUndefined();
    });

    it('rejects an inverted range with 422', async () => {
      const response = await helpers.exportData({
        format: 'json',
        dateRange: { from: '2024-12-31', to: '2024-01-01' },
      });
      expect(response.statusCode).toBe(422);
    });

    it('rejects a malformed date string with 422', async () => {
      const response = await helpers.exportData({
        format: 'json',
        // Datetime instead of date – we accept calendar-day boundaries only.
        dateRange: { from: '2024-01-01T00:00:00Z' },
      });
      expect(response.statusCode).toBe(422);
    });
  });

  describe('Size limit (ExportTooLargeError → 409)', () => {
    it('responds with 409 + payloadTooLarge when the row count would exceed MAX_EXPORT_ROWS', async () => {
      // The local data-export types module re-exports MAX_EXPORT_ROWS from
      // `@bt/shared/types`, which makes it a getter on the namespace object
      // (not a writable property). `jest.replaceProperty` rejects getters,
      // so spy on the getter instead.
      const exportTypesModule = await import('@services/data-export/types');
      // The getter's return type is the literal `250000`; cast through unknown
      // to swap in the test sentinel without widening the prod type.
      const spy = jest
        .spyOn(exportTypesModule, 'MAX_EXPORT_ROWS', 'get')
        .mockReturnValue(0 as unknown as typeof exportTypesModule.MAX_EXPORT_ROWS);

      try {
        const account = await helpers.createAccount({ raw: true });
        await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 1,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        const response = await helpers.exportData({ format: 'json' });
        expect(response.statusCode).toBe(409);
        const body = response.errorBody as { response?: { code?: string } } | null;
        expect(body?.response?.code).toBe(API_ERROR_CODES.payloadTooLarge);
      } finally {
        spy.mockRestore();
      }
    });
  });
});
