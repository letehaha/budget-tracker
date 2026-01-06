import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Parse CSV endpoint', () => {
  describe('successful parsing', () => {
    it('should parse a valid CSV with comma delimiter', async () => {
      const fileContent = helpers.loadCsvFixture('valid-comma.csv');
      const result = await helpers.parseCsv({
        payload: { fileContent },
        raw: true,
      });

      expect(result.headers).toEqual(['Date', 'Amount', 'Description', 'Category', 'Account', 'Currency', 'Type']);
      expect(result.detectedDelimiter).toBe(',');
      expect(result.totalRows).toBe(5);
      expect(result.preview).toHaveLength(5);
      expect(result.preview[0]).toEqual({
        Date: '2024-01-15',
        Amount: '100.50',
        Description: 'Grocery shopping',
        Category: 'Food',
        Account: 'Main Account',
        Currency: 'USD',
        Type: 'expense',
      });
    });

    it('should parse a valid CSV with semicolon delimiter', async () => {
      const fileContent = helpers.loadCsvFixture('valid-semicolon.csv');
      const result = await helpers.parseCsv({
        payload: { fileContent },
        raw: true,
      });

      expect(result.headers).toEqual(['Date', 'Amount', 'Description', 'Category', 'Account', 'Currency', 'Type']);
      expect(result.detectedDelimiter).toBe(';');
      expect(result.totalRows).toBe(3);
      expect(result.preview).toHaveLength(3);
    });

    it('should parse a valid CSV with tab delimiter', async () => {
      const fileContent = helpers.loadCsvFixture('valid-tab.csv');
      const result = await helpers.parseCsv({
        payload: { fileContent },
        raw: true,
      });

      expect(result.headers).toEqual(['Date', 'Amount', 'Description', 'Category', 'Account', 'Currency', 'Type']);
      expect(result.detectedDelimiter).toBe('\t');
      expect(result.totalRows).toBe(2);
    });

    it('should use provided delimiter instead of auto-detecting', async () => {
      const fileContent = helpers.loadCsvFixture('valid-semicolon.csv');
      // Force comma delimiter even though file uses semicolon
      const result = await helpers.parseCsv({
        payload: { fileContent, delimiter: ';' },
        raw: true,
      });

      expect(result.detectedDelimiter).toBe(';');
      expect(result.headers).toEqual(['Date', 'Amount', 'Description', 'Category', 'Account', 'Currency', 'Type']);
    });

    it('should limit preview rows and return correct total count', async () => {
      const fileContent = helpers.loadCsvFixture('large-file.csv');
      const result = await helpers.parseCsv({
        payload: { fileContent },
        raw: true,
      });

      // large-file.csv has 25 data rows
      expect(result.totalRows).toBe(25);
      // Preview should be limited to 50 rows (but we only have 25)
      expect(result.preview).toHaveLength(25);
    });

    it('should handle CSV with special characters in values', async () => {
      const fileContent = helpers.loadCsvFixture('special-characters.csv');
      const result = await helpers.parseCsv({
        payload: { fileContent },
        raw: true,
      });

      expect(result.headers).toEqual(['Date', 'Amount', 'Description', 'Category', 'Account', 'Currency', 'Type']);
      expect(result.preview[0]?.Description).toBe('Grocery, shopping & more');
      expect(result.preview[1]?.Description).toBe('Coffee "Best" shop');
      expect(result.preview[2]?.Description).toBe('Salary (monthly)');
    });

    it('should parse CSV with minimal columns', async () => {
      const fileContent = helpers.loadCsvFixture('minimal-columns.csv');
      const result = await helpers.parseCsv({
        payload: { fileContent },
        raw: true,
      });

      expect(result.headers).toEqual(['Date', 'Amount']);
      expect(result.totalRows).toBe(3);
      expect(result.preview[0]).toEqual({
        Date: '2024-01-15',
        Amount: '100.50',
      });
    });

    it('should parse CSV with multiple accounts and currencies', async () => {
      const fileContent = helpers.loadCsvFixture('multiple-accounts.csv');
      const result = await helpers.parseCsv({
        payload: { fileContent },
        raw: true,
      });

      expect(result.totalRows).toBe(5);
      // Verify different accounts are parsed correctly
      const accounts = result.preview.map((row) => row.Account);
      expect(accounts).toContain('Checking Account');
      expect(accounts).toContain('Savings Account');
      expect(accounts).toContain('Credit Card');

      // Verify different currencies
      const currencies = result.preview.map((row) => row.Currency);
      expect(currencies).toContain('USD');
      expect(currencies).toContain('EUR');
    });

    it('should parse CSV with European date and number format', async () => {
      const fileContent = helpers.loadCsvFixture('european-format.csv');
      const result = await helpers.parseCsv({
        payload: { fileContent },
        raw: true,
      });

      expect(result.detectedDelimiter).toBe(';');
      expect(result.preview[0]?.Date).toBe('15.01.2024');
      expect(result.preview[0]?.Amount).toBe('100,50');
    });
  });

  describe('error handling', () => {
    it('should return validation error for empty file content', async () => {
      const result = await helpers.parseCsv({
        payload: { fileContent: '' },
        raw: false,
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should return validation error for empty CSV (no data)', async () => {
      const fileContent = helpers.loadCsvFixture('empty.csv');
      const result = await helpers.parseCsv({
        payload: { fileContent },
        raw: false,
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should parse CSV with headers only (no data rows)', async () => {
      const fileContent = helpers.loadCsvFixture('headers-only.csv');
      const result = await helpers.parseCsv({
        payload: { fileContent },
        raw: true,
      });

      expect(result.headers).toEqual(['Date', 'Amount', 'Description', 'Category', 'Account', 'Currency', 'Type']);
      expect(result.totalRows).toBe(0);
      expect(result.preview).toHaveLength(0);
    });
  });
});
