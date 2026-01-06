import type { ExtractedTransaction } from '@bt/shared/types';
import { TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

/**
 * Tests for the Statement Parser detect-duplicates endpoint.
 *
 * Note: Core duplicate detection logic is tested in the generic service:
 * packages/backend/src/services/transactions/detect-duplicates.service.e2e.ts
 *
 * These tests verify:
 * 1. Endpoint works correctly
 * 2. Type mapping (ExtractedTransaction → StatementDuplicateMatch)
 * 3. Validation
 */
describe('Statement Parser - Detect Duplicates endpoint', () => {
  describe('endpoint and type mapping', () => {
    it('should return empty duplicates for new account', async () => {
      const account = await helpers.createAccount({ raw: true });

      const transactions: ExtractedTransaction[] = [
        {
          date: '2024-01-15 10:30:00',
          description: 'Test transaction',
          amount: 10050,
          type: 'expense',
        },
      ];

      const result = await helpers.statementDetectDuplicates({
        payload: {
          accountId: account.id,
          transactions,
        },
        raw: true,
      });

      expect(result.duplicates).toHaveLength(0);
    });

    it('should return correct StatementDuplicateMatch structure', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Create existing transaction
      const txPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 10050,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-01-15').toISOString(),
        note: 'Existing note',
      });
      await helpers.createTransaction({ payload: txPayload, raw: true });

      const transactions: ExtractedTransaction[] = [
        {
          date: '2024-01-15 10:30:00',
          description: 'Grocery shopping',
          amount: 10050,
          type: 'expense',
        },
      ];

      const result = await helpers.statementDetectDuplicates({
        payload: {
          accountId: account.id,
          transactions,
        },
        raw: true,
      });

      expect(result.duplicates).toHaveLength(1);

      const duplicate = result.duplicates[0]!;

      // Verify StatementDuplicateMatch structure
      expect(duplicate.transactionIndex).toBe(0);

      // extractedTransaction should preserve the input
      expect(duplicate.extractedTransaction.date).toBe('2024-01-15 10:30:00');
      expect(duplicate.extractedTransaction.description).toBe('Grocery shopping');
      expect(duplicate.extractedTransaction.amount).toBe(10050);
      expect(duplicate.extractedTransaction.type).toBe('expense');

      // existingTransaction should have DB transaction data
      expect(typeof duplicate.existingTransaction.id).toBe('number');
      expect(duplicate.existingTransaction.date).toBe('2024-01-15');
      expect(duplicate.existingTransaction.amount).toBe(10050);
      expect(duplicate.existingTransaction.note).toBe('Existing note');
    });
  });

  describe('validation', () => {
    it('should return error for invalid amount', async () => {
      const account = await helpers.createAccount({ raw: true });

      const result = await helpers.statementDetectDuplicates({
        payload: {
          accountId: account.id,
          transactions: [
            {
              date: '2024-01-15',
              description: 'Test',
              amount: -100,
              type: 'expense',
            },
          ],
        },
        raw: false,
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should return error for invalid transaction type', async () => {
      const account = await helpers.createAccount({ raw: true });

      const result = await helpers.statementDetectDuplicates({
        payload: {
          accountId: account.id,
          transactions: [
            {
              date: '2024-01-15',
              description: 'Test',
              amount: 100,
              type: 'invalid' as 'expense',
            },
          ],
        },
        raw: false,
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });
});
