import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { expectCompleted, waitForBudgetBakersWalletCompletion } from '@tests/helpers/import-export';

/**
 * The default `express.json()` limit is 100KB. Every Wallet import step carries the
 * whole CSV inline as `fileContent`, so the request body must be allowed past that
 * ceiling. These tests assert the endpoints accept such a body.
 */
const MIN_BODY_BYTES = 100 * 1024;

const ROW_COUNT = 800;
const ACCOUNT_NAME = 'Wallet Body Limit UAH';
const CSV_HEADER =
  'account;category;currency;amount;ref_currency_amount;type;payment_type;note;date;transfer;payee;labels';

// The parser numbers data rows from 2 (header is line 1).
const FIRST_ROW_INDEX = 2;

function buildOversizedWalletCsv({ rowCount }: { rowCount: number }): string {
  const rows = Array.from({ length: rowCount }, (_, index) => {
    const day = String((index % 28) + 1).padStart(2, '0');
    const amount = ((index % 500) + 1).toFixed(2);
    const note = `Wallet oversized body row ${index} - padding to exceed the default JSON body limit`;
    return `${ACCOUNT_NAME};Groceries;UAH;${amount};${amount};Expense;Credit card;${note};2025-06-${day}T12:00:00.000Z;false;;`;
  });

  return [CSV_HEADER, ...rows].join('\n');
}

describe('Budget Bakers Wallet import - request body size limit', () => {
  describe('POST /import/budget-bakers-wallet/parse', () => {
    it('accepts a fileContent larger than the default 100KB body limit', async () => {
      const fileContent = buildOversizedWalletCsv({ rowCount: ROW_COUNT });
      expect(Buffer.byteLength(JSON.stringify({ fileContent }))).toBeGreaterThan(MIN_BODY_BYTES);

      const response = await helpers.parseBudgetBakersWallet({ payload: { fileContent } });

      expect(response.statusCode).toBe(200);
      expect(response.body.response.result.transactions).toHaveLength(ROW_COUNT);
    });
  });

  describe('POST /import/budget-bakers-wallet/detect-duplicates', () => {
    it('accepts a fileContent larger than the default 100KB body limit', async () => {
      const fileContent = buildOversizedWalletCsv({ rowCount: ROW_COUNT });
      const accountMapping = {
        [ACCOUNT_NAME]: { action: 'create-new' as const, currencyCode: 'UAH', currentBalance: null },
      };

      const payload = { fileContent, accountMapping };
      expect(Buffer.byteLength(JSON.stringify(payload))).toBeGreaterThan(MIN_BODY_BYTES);

      const response = await helpers.detectBudgetBakersWalletDuplicates({ payload });

      expect(response.statusCode).toBe(200);
      expect(response.body.response.duplicates).toEqual([]);
    });
  });

  describe('POST /import/budget-bakers-wallet/execute', () => {
    it('accepts a fileContent larger than the default 100KB body limit', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ currencyCode: 'UAH', initialBalance: 0 }),
        raw: true,
      });

      const fileContent = buildOversizedWalletCsv({ rowCount: ROW_COUNT });
      const accountMapping = {
        [ACCOUNT_NAME]: { action: 'link-existing' as const, accountId: account.id },
      };

      // The whole CSV travels on the wire even when the user keeps only a few rows,
      // so the body stays oversized while the worker writes a small slice.
      const importedCount = 10;
      const skipDuplicateIndices = Array.from(
        { length: ROW_COUNT - importedCount },
        (_, index) => FIRST_ROW_INDEX + index,
      );

      const payload = { fileContent, accountMapping, skipDuplicateIndices };
      expect(Buffer.byteLength(JSON.stringify(payload))).toBeGreaterThan(MIN_BODY_BYTES);

      const response = await helpers.executeBudgetBakersWallet({ payload });

      expect(response.statusCode).toBe(200);

      const { jobId } = response.body.response;
      expect(jobId).toBeTruthy();

      const progress = await waitForBudgetBakersWalletCompletion({ jobId });
      expectCompleted(progress);

      expect(progress.summary.transactionsImported).toBe(importedCount);
      expect(progress.summary.duplicatesSkipped).toBe(ROW_COUNT - importedCount);
      expect(progress.summary.errors).toHaveLength(0);
    });
  });
});
