import type { ExtractedTransaction } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

/**
 * The default `express.json()` limit is 100KB. A real statement import sends the
 * full extracted array on every step, so the request body must be allowed to grow
 * well past that ceiling. These tests assert the endpoints accept such a body.
 */
const MIN_BODY_BYTES = 100 * 1024;

const TRANSACTION_COUNT = 600;

// 200 chars keeps each description under the `note` column's VARCHAR(255) while
// pushing the serialized array past the 100KB default limit.
const DESCRIPTION_LENGTH = 200;
const DESCRIPTION_PADDING = 'CARD PAYMENT MERCHANT REFERENCE '.repeat(8);

function buildOversizedTransactions({ count }: { count: number }): ExtractedTransaction[] {
  return Array.from({ length: count }, (_, index) => ({
    date: `2024-03-${String((index % 28) + 1).padStart(2, '0')} 10:00:00`,
    description: `Statement row ${index} ${DESCRIPTION_PADDING}`.slice(0, DESCRIPTION_LENGTH),
    amount: (index % 500) + 1,
    type: index % 3 === 0 ? ('income' as const) : ('expense' as const),
  }));
}

describe('Statement import - request body size limit', () => {
  describe('POST /import/text-source/detect-duplicates', () => {
    it('accepts a transactions array larger than the default 100KB body limit', async () => {
      const account = await helpers.createAccount({ raw: true });
      const transactions = buildOversizedTransactions({ count: TRANSACTION_COUNT });

      const payload = { accountId: account.id, transactions };
      expect(Buffer.byteLength(JSON.stringify(payload))).toBeGreaterThan(MIN_BODY_BYTES);

      const response = await helpers.statementDetectDuplicates({ payload });

      expect(response.statusCode).toBe(200);
      expect(response.body.response.duplicates).toEqual([]);
    });
  });

  describe('POST /import/text-source/execute', () => {
    it('accepts a transactions array larger than the default 100KB body limit', async () => {
      const account = await helpers.createAccount({ raw: true });
      const transactions = buildOversizedTransactions({ count: TRANSACTION_COUNT });

      // The frontend sends every extracted row regardless of selection, so the
      // body stays oversized while only a slice is actually imported.
      const importedCount = 25;
      const skipIndices = Array.from({ length: TRANSACTION_COUNT - importedCount }, (_, index) => index);

      const payload = { accountId: account.id, transactions, skipIndices };
      expect(Buffer.byteLength(JSON.stringify(payload))).toBeGreaterThan(MIN_BODY_BYTES);

      const response = await helpers.statementExecuteImport({ payload });

      expect(response.statusCode).toBe(200);

      const { summary, newTransactionIds } = response.body.response;
      expect(summary.imported).toBe(importedCount);
      expect(summary.skipped).toBe(TRANSACTION_COUNT - importedCount);
      expect(summary.errors).toHaveLength(0);
      expect(newTransactionIds).toHaveLength(importedCount);

      const allTransactions = await helpers.getTransactions({
        accountIds: [account.id],
        limit: 100,
        raw: true,
      });
      const persisted = allTransactions.filter((tx) => newTransactionIds.includes(tx.id));
      expect(persisted).toHaveLength(importedCount);
    });
  });
});
