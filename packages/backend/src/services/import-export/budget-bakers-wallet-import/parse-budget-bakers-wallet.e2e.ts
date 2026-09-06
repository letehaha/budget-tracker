import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

/**
 * The parser's full logic (transfer pairing, fuzzy matching, date parsing, etc.)
 * is exercised in `parse-budget-bakers-wallet.unit.ts`. These tests only smoke-test
 * the HTTP wiring: controller validates the request, delegates to the service, and
 * wraps the result in the expected response envelope.
 */
describe('Parse Budget Bakers Wallet endpoint', () => {
  describe('POST /import/budget-bakers-wallet/parse', () => {
    it('parses basic.csv into the expected envelope, counts, base currency, date range', async () => {
      const fileContent = helpers.loadBudgetBakersWalletFixture('basic.csv');
      const { result } = await helpers.parseBudgetBakersWallet({ payload: { fileContent }, raw: true });

      expect(Array.isArray(result.accounts)).toBe(true);
      expect(result.accounts.length).toBeGreaterThan(0);
      expect(Array.isArray(result.categories)).toBe(true);
      expect(Array.isArray(result.tags)).toBe(true);
      expect(Array.isArray(result.transactions)).toBe(true);
      expect(Array.isArray(result.transfers)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);

      // basic.csv has exactly 5 distinct accounts: Monobank Black UAH,
      // PKO Polska bank | USD, Crypto, Wise USD, PKO Polska Bank | PLN.
      expect(result.accounts.length).toBe(5);

      // basic.csv has exactly 2 paired transfers:
      //   - Crypto → Wise USD (same-currency same-ref-amount pair)
      //   - PKO Polska bank | USD → PKO Polska Bank | PLN (cross-currency pair)
      // The lone Monobank UAH transfer leg has no counterpart income row and is
      // NOT counted as a paired transfer.
      expect(result.transfers.length).toBe(2);

      // basic.csv labels: "Want" appears on 2 rows, "Need" on 1 row → 2 distinct tags.
      expect(result.tags.length).toBe(2);
      const tagNames = result.tags.map((t) => t.name);
      expect(tagNames).toContain('Want');

      // UAH rows have amount == ref_currency_amount (e.g. 400 == 400).
      expect(result.detectedBaseCurrency).toBe('UAH');

      expect(result.dateRange).not.toBeNull();
      expect(result.dateRange!.from).toBeTruthy();
      expect(result.dateRange!.to).toBeTruthy();
      // "from" must be chronologically before or equal to "to".
      expect(new Date(result.dateRange!.from).getTime()).toBeLessThanOrEqual(new Date(result.dateRange!.to).getTime());

      const categoryNames = result.categories.map((c) => c.name);
      expect(categoryNames).not.toContain('Transfer, withdraw');
    });

    it('surfaces request and parser validation errors as HTTP 422', async () => {
      // The Zod schema rejects an empty/whitespace-only string before it even
      // reaches the parser, so no worker is needed — the controller returns 422.
      const whitespace = await helpers.parseBudgetBakersWallet({ payload: { fileContent: '   ' } });
      expect(whitespace.statusCode).toBe(ERROR_CODES.ValidationError);

      const empty = await helpers.parseBudgetBakersWallet({ payload: { fileContent: '' } });
      expect(empty.statusCode).toBe(ERROR_CODES.ValidationError);

      // Non-empty but malformed: passes the Zod min(1) check, and the parser
      // rejects it for missing required columns. Must surface as 422, not 500.
      const malformedCsv = 'date,description,amount\n2025-01-01,Coffee,5.00\n';
      const malformed = await helpers.parseBudgetBakersWallet({ payload: { fileContent: malformedCsv } });
      expect(malformed.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });
});
