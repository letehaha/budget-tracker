import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { expectCompleted, waitForBudgetBakersWalletCompletion } from '@tests/helpers/import-export';

/**
 * The default `express.json()` limit is 100KB. Every Wallet import step carries the
 * whole CSV inline as `fileContent`, so the request body must be allowed past that
 * ceiling. This test asserts every step accepts such a body.
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
  it('accepts a fileContent larger than the default 100KB body limit on parse, detect and execute', async () => {
    const fileContent = buildOversizedWalletCsv({ rowCount: ROW_COUNT });
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ currencyCode: 'UAH', initialBalance: 0 }),
      raw: true,
    });

    const parsePayload = { fileContent };
    expect(Buffer.byteLength(JSON.stringify(parsePayload))).toBeGreaterThan(MIN_BODY_BYTES);

    const parseResponse = await helpers.parseBudgetBakersWallet({ payload: parsePayload });
    expect(parseResponse.statusCode).toBe(200);
    expect(parseResponse.body.response.result.transactions).toHaveLength(ROW_COUNT);

    const detectPayload = {
      fileContent,
      accountMapping: {
        [ACCOUNT_NAME]: { action: 'create-new' as const, currencyCode: 'UAH', currentBalance: null },
      },
    };
    expect(Buffer.byteLength(JSON.stringify(detectPayload))).toBeGreaterThan(MIN_BODY_BYTES);

    const detectResponse = await helpers.detectBudgetBakersWalletDuplicates({ payload: detectPayload });
    expect(detectResponse.statusCode).toBe(200);
    expect(detectResponse.body.response.duplicates).toEqual([]);

    // The whole CSV travels on the wire even when the user keeps only a few rows,
    // so the body stays oversized while the worker writes a small slice.
    const importedCount = 10;
    const executePayload = {
      fileContent,
      accountMapping: { [ACCOUNT_NAME]: { action: 'link-existing' as const, accountId: account.id } },
      skipDuplicateIndices: Array.from({ length: ROW_COUNT - importedCount }, (_, index) => FIRST_ROW_INDEX + index),
    };
    expect(Buffer.byteLength(JSON.stringify(executePayload))).toBeGreaterThan(MIN_BODY_BYTES);

    const executeResponse = await helpers.executeBudgetBakersWallet({ payload: executePayload });
    expect(executeResponse.statusCode).toBe(200);

    const { jobId } = executeResponse.body.response;
    expect(jobId).toBeTruthy();

    const progress = await waitForBudgetBakersWalletCompletion({ jobId });
    expectCompleted(progress);

    expect(progress.summary.errors).toHaveLength(0);
    expect(progress.summary.transactionsImported).toBe(importedCount);
    expect(progress.summary.duplicatesSkipped).toBe(ROW_COUNT - importedCount);
  }, 60_000);
});
