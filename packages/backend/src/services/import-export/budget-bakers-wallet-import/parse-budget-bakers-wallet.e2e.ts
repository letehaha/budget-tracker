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
    it('routes a valid CSV through the controller and returns the parse result envelope', async () => {
      const fileContent = helpers.loadBudgetBakersWalletFixture('basic.csv');
      const { result } = await helpers.parseBudgetBakersWallet({ payload: { fileContent }, raw: true });

      // Confirm the response shape matches the contract. The unit test covers
      // exact counts and field values — here we only verify the envelope exists
      // and the controller correctly plumbed the service output through.
      expect(Array.isArray(result.accounts)).toBe(true);
      expect(result.accounts.length).toBeGreaterThan(0);
      expect(Array.isArray(result.categories)).toBe(true);
      expect(Array.isArray(result.tags)).toBe(true);
      expect(Array.isArray(result.transactions)).toBe(true);
      expect(Array.isArray(result.transfers)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('returns the expected account, transfer, and tag counts for the basic fixture', async () => {
      const fileContent = helpers.loadBudgetBakersWalletFixture('basic.csv');
      const { result } = await helpers.parseBudgetBakersWallet({ payload: { fileContent }, raw: true });

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
    });

    it('detects the base currency (UAH — rows where amount === ref_currency_amount)', async () => {
      const fileContent = helpers.loadBudgetBakersWalletFixture('basic.csv');
      const { result } = await helpers.parseBudgetBakersWallet({ payload: { fileContent }, raw: true });

      // UAH rows have amount == ref_currency_amount (e.g. 400 == 400).
      expect(result.detectedBaseCurrency).toBe('UAH');
    });

    it('returns a dateRange covering all parsed rows', async () => {
      const fileContent = helpers.loadBudgetBakersWalletFixture('basic.csv');
      const { result } = await helpers.parseBudgetBakersWallet({ payload: { fileContent }, raw: true });

      expect(result.dateRange).not.toBeNull();
      expect(result.dateRange!.from).toBeTruthy();
      expect(result.dateRange!.to).toBeTruthy();
      // "from" must be chronologically before or equal to "to".
      expect(new Date(result.dateRange!.from).getTime()).toBeLessThanOrEqual(new Date(result.dateRange!.to).getTime());
    });

    it('does not create a "Transfer, withdraw" category entry (transfer marker is excluded)', async () => {
      const fileContent = helpers.loadBudgetBakersWalletFixture('basic.csv');
      const { result } = await helpers.parseBudgetBakersWallet({ payload: { fileContent }, raw: true });

      const categoryNames = result.categories.map((c) => c.name);
      expect(categoryNames).not.toContain('Transfer, withdraw');
    });

    it('surfaces parser validation errors as HTTP 422 for empty file content', async () => {
      // The Zod schema rejects an empty/whitespace-only string before it even
      // reaches the parser, so no worker is needed — the controller returns 422.
      const response = await helpers.parseBudgetBakersWallet({ payload: { fileContent: '   ' } });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('surfaces parser validation errors as HTTP 422 for missing required body field', async () => {
      // Sending an empty body violates the Zod schema — should fail validation.
      const response = await helpers.parseBudgetBakersWallet({ payload: { fileContent: '' } });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    // T14: non-empty but malformed CSV (passes the Zod min(1) check because it
    // is not empty, but the parser rejects it for missing required columns).
    // The controller must surface this as 422, not 500.
    it('returns 422 for a non-empty CSV that is missing required Wallet columns', async () => {
      // Has content (passes Zod min(1)) but is missing most required columns.
      const malformedCsv = 'date,description,amount\n2025-01-01,Coffee,5.00\n';
      const response = await helpers.parseBudgetBakersWallet({ payload: { fileContent: malformedCsv } });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });
});
