import { type RecordId, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import type { TransactionApiResponse } from '@root/serializers/transactions.serializer';
import * as helpers from '@tests/helpers';

// The create helper declares the Sequelize model as its raw return type, but the endpoint
// answers with the serialized response: money fields are decimals, not Money instances.
const createTx = async (payload: Parameters<typeof helpers.buildTransactionPayload>[0]) => {
  const result = await helpers.createTransaction({
    payload: helpers.buildTransactionPayload(payload),
    raw: true,
  });
  return (result as unknown as (TransactionApiResponse & { id: RecordId })[])[0]!;
};

// Both request schemas answer 422 from a dozen different rules, so a status-only assertion
// would stay green while an unrelated rule fires. Every negative case pins its own message.
const RULES = {
  createPairTogether: '"originalAmount" and "originalCurrencyCode" must be provided together',
  updatePairTogether: '"originalAmount" and "originalCurrencyCode" must be set, or cleared, together',
  transferPayload: 'Original currency metadata cannot be added to transfer transactions',
  invalidCurrencyCode: 'Invalid currency code',
};

const expectRejectedBy = ({ response, rule }: { response: unknown; rule: string }) => {
  const rejection = response as helpers.CustomResponse<{ message: string }>;

  expect(rejection.statusCode).toBe(ERROR_CODES.ValidationError);
  expect(rejection.body.response.message).toContain(rule);
};

describe('Transaction original-currency metadata', () => {
  describe('POST /transactions', () => {
    it('stores and returns both fields as decimals', async () => {
      const account = await helpers.createAccount({ raw: true });

      const created = await createTx({
        accountId: account.id,
        amount: 30,
        originalAmount: 5000.55,
        originalCurrencyCode: 'JPY',
      });

      expect(created.originalAmount).toBe(5000.55);
      expect(created.originalCurrencyCode).toBe('JPY');

      const fetched = await helpers.getTransactionById({ id: created.id, raw: true });

      expect(fetched!.originalAmount).toBe(5000.55);
      expect(fetched!.originalCurrencyCode).toBe('JPY');
    });

    it('leaves both fields null when neither is provided', async () => {
      const account = await helpers.createAccount({ raw: true });

      const created = await createTx({ accountId: account.id, amount: 30 });

      expect(created.originalAmount).toBeNull();
      expect(created.originalCurrencyCode).toBeNull();
    });

    it('accepts a currency the user has not connected', async () => {
      const account = await helpers.createAccount({ raw: true });

      const response = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 30,
          originalAmount: 5000,
          originalCurrencyCode: 'JPY',
        }),
      });

      expect(response.statusCode).toBe(200);

      const connectedCurrencies = await helpers.getUserCurrencies();
      expect(connectedCurrencies.some((item) => item.currencyCode === 'JPY')).toBe(false);
    });

    it('rejects originalAmount without originalCurrencyCode', async () => {
      const account = await helpers.createAccount({ raw: true });

      const response = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 30, originalAmount: 5000 }),
      });

      expectRejectedBy({ response, rule: RULES.createPairTogether });
    });

    it('rejects an unknown currency code', async () => {
      const account = await helpers.createAccount({ raw: true });

      const response = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 30,
          originalAmount: 5000,
          originalCurrencyCode: 'ZZZ',
        }),
      });

      expectRejectedBy({ response, rule: RULES.invalidCurrencyCode });
    });

    it('rejects the pair on a transfer', async () => {
      const [source, destination] = await Promise.all([
        helpers.createAccount({ raw: true }),
        helpers.createAccount({ raw: true }),
      ]);

      const response = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: source.id,
          amount: 30,
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          destinationAccountId: destination.id,
          destinationAmount: 30,
          originalAmount: 5000,
          originalCurrencyCode: 'JPY',
        }),
      });

      expectRejectedBy({ response, rule: RULES.transferPayload });
    });

    it('does not affect the account balance or refAmount', async () => {
      const [plain, withOriginal] = await Promise.all([
        helpers.createAccount({ raw: true }),
        helpers.createAccount({ raw: true }),
      ]);

      const plainTx = await createTx({
        accountId: plain.id,
        amount: 30,
        transactionType: TRANSACTION_TYPES.expense,
      });
      const originalTx = await createTx({
        accountId: withOriginal.id,
        amount: 30,
        transactionType: TRANSACTION_TYPES.expense,
        originalAmount: 5000,
        originalCurrencyCode: 'JPY',
      });

      expect(originalTx.refAmount).toBe(plainTx.refAmount);

      const [plainAccount, withOriginalAccount] = await Promise.all([
        helpers.getAccount({ id: plain.id, raw: true }),
        helpers.getAccount({ id: withOriginal.id, raw: true }),
      ]);

      expect(withOriginalAccount.currentBalance).toBe(plainAccount.currentBalance);
      expect(withOriginalAccount.refCurrentBalance).toBe(plainAccount.refCurrentBalance);
    });
  });

  describe('PUT /transactions/:id', () => {
    it('sets the pair on an existing transaction', async () => {
      const account = await helpers.createAccount({ raw: true });
      const created = await createTx({ accountId: account.id, amount: 30 });

      const response = await helpers.updateTransaction({
        id: created.id,
        payload: { originalAmount: 5000, originalCurrencyCode: 'JPY' },
      });

      expect(response.statusCode).toBe(200);

      const updated = await helpers.getTransactionById({ id: created.id, raw: true });
      expect(updated!.originalAmount).toBe(5000);
      expect(updated!.originalCurrencyCode).toBe('JPY');
    });

    it('clears the pair when both are sent as null', async () => {
      const account = await helpers.createAccount({ raw: true });
      const created = await createTx({
        accountId: account.id,
        amount: 30,
        originalAmount: 5000,
        originalCurrencyCode: 'JPY',
      });

      const response = await helpers.updateTransaction({
        id: created.id,
        payload: { originalAmount: null, originalCurrencyCode: null },
      });

      expect(response.statusCode).toBe(200);

      const updated = await helpers.getTransactionById({ id: created.id, raw: true });
      expect(updated!.originalAmount).toBeNull();
      expect(updated!.originalCurrencyCode).toBeNull();
    });

    it('keeps the stored pair when the request touches neither field', async () => {
      const account = await helpers.createAccount({ raw: true });
      const created = await createTx({
        accountId: account.id,
        amount: 30,
        originalAmount: 5000,
        originalCurrencyCode: 'JPY',
      });

      await helpers.updateTransaction({ id: created.id, payload: { note: 'ramen' } });

      const updated = await helpers.getTransactionById({ id: created.id, raw: true });
      expect(updated!.originalAmount).toBe(5000);
      expect(updated!.originalCurrencyCode).toBe('JPY');
    });

    it('rejects setting only one half of the pair', async () => {
      const account = await helpers.createAccount({ raw: true });
      const created = await createTx({ accountId: account.id, amount: 30 });

      const response = await helpers.updateTransaction({ id: created.id, payload: { originalAmount: 5000 } });

      expectRejectedBy({ response, rule: RULES.updatePairTogether });
    });

    it('rejects clearing only one half of the pair', async () => {
      const account = await helpers.createAccount({ raw: true });
      const created = await createTx({
        accountId: account.id,
        amount: 30,
        originalAmount: 5000,
        originalCurrencyCode: 'JPY',
      });

      const response = await helpers.updateTransaction({ id: created.id, payload: { originalAmount: null } });

      expectRejectedBy({ response, rule: RULES.updatePairTogether });
    });

    it('rejects the pair when the transaction becomes a transfer', async () => {
      const [source, destination] = await Promise.all([
        helpers.createAccount({ raw: true }),
        helpers.createAccount({ raw: true }),
      ]);
      const created = await createTx({
        accountId: source.id,
        amount: 30,
        transactionType: TRANSACTION_TYPES.expense,
      });

      const response = await helpers.updateTransaction({
        id: created.id,
        payload: {
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          destinationAccountId: destination.id,
          destinationAmount: 30,
          originalAmount: 5000,
          originalCurrencyCode: 'JPY',
        },
      });

      expectRejectedBy({ response, rule: RULES.transferPayload });
    });

    it('rejects the pair sent with destination fields but no explicit transferNature', async () => {
      const [source, destination] = await Promise.all([
        helpers.createAccount({ raw: true }),
        helpers.createAccount({ raw: true }),
      ]);
      const created = await createTx({
        accountId: source.id,
        amount: 30,
        transactionType: TRANSACTION_TYPES.expense,
      });

      const response = await helpers.updateTransaction({
        id: created.id,
        payload: {
          destinationAccountId: destination.id,
          destinationAmount: 30,
          originalAmount: 5000,
          originalCurrencyCode: 'JPY',
        },
      });

      expectRejectedBy({ response, rule: RULES.transferPayload });
    });

    it('keeps the stored pair through a transfer round-trip and never copies it to the opposite leg', async () => {
      const [source, destination] = await Promise.all([
        helpers.createAccount({ raw: true }),
        helpers.createAccount({ raw: true }),
      ]);
      const created = await createTx({
        accountId: source.id,
        amount: 30,
        transactionType: TRANSACTION_TYPES.expense,
        originalAmount: 5000,
        originalCurrencyCode: 'JPY',
      });

      const toTransfer = await helpers.updateTransaction({
        id: created.id,
        payload: {
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          destinationAccountId: destination.id,
          destinationAmount: 30,
        },
      });
      expect(toTransfer.statusCode).toBe(200);

      const base = await helpers.getTransactionById({ id: created.id, raw: true });
      expect(base!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);
      expect(base!.originalAmount).toBe(5000);
      expect(base!.originalCurrencyCode).toBe('JPY');

      const legs = await helpers.getTransactionsByTransferId({ transferId: base!.transferId!, raw: true });
      const opposite = legs.find((leg) => leg.id !== created.id)!;
      expect(opposite.originalAmount).toBeNull();
      expect(opposite.originalCurrencyCode).toBeNull();

      const backToExpense = await helpers.updateTransaction({
        id: created.id,
        payload: { transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer },
      });
      expect(backToExpense.statusCode).toBe(200);

      const reverted = await helpers.getTransactionById({ id: created.id, raw: true });
      expect(reverted!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
      expect(reverted!.originalAmount).toBe(5000);
      expect(reverted!.originalCurrencyCode).toBe('JPY');
    });
  });
});
