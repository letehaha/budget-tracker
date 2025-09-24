import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES, TransactionModel } from '@bt/shared/types';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Delete transaction controller', () => {
  it('should return validation error if no data passed', async () => {
    await helpers.createTransaction();
    const res = await helpers.deleteTransaction();

    expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
  });
  it('should successfully create and delete transaction', async () => {
    const createdTransactions = await helpers.createTransaction({ raw: true });
    const transactions = await helpers.getTransactions({ raw: true });

    expect(createdTransactions.length).toBe(transactions.length);

    const res = await helpers.deleteTransaction({ id: transactions[0]!.id });

    const txsAfterDeletion = await helpers.getTransactions({ raw: true });

    expect(res.statusCode).toEqual(200);
    expect(txsAfterDeletion.length).toBe(0);
  });
  describe('transfer transactions', () => {
    let transactions: TransactionModel[] = [];

    beforeEach(async () => {
      const currencyA = global.MODELS_CURRENCIES.find((item) => item.code === 'EUR');
      await helpers.addUserCurrencies({ currencyCodes: [currencyA.code] });
      const accountA = await helpers.createAccount({
        payload: {
          ...helpers.buildAccountPayload(),
          currencyCode: currencyA.code,
        },
        raw: true,
      });

      const currencyB = global.MODELS_CURRENCIES.find((item) => item.code === 'UAH');
      await helpers.addUserCurrencies({ currencyCodes: [currencyB.code] });
      const accountB = await helpers.createAccount({
        payload: {
          ...helpers.buildAccountPayload(),
          currencyCode: currencyB.code,
        },
        raw: true,
      });

      const DESTINATION_AMOUNT = 25000;
      const txPayload = {
        ...helpers.buildTransactionPayload({ accountId: accountA.id }),
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
        destinationAmount: DESTINATION_AMOUNT,
        destinationAccountId: accountB.id,
      };
      const createdTransactions = await helpers.createTransaction({
        payload: txPayload,
        raw: true,
      });
      transactions = await helpers.getTransactions({ raw: true });

      expect(createdTransactions.length).toBe(transactions.length);
    });

    it('should successfully delete both tx when deleting "from" transaction', async () => {
      const res = await helpers.deleteTransaction({ id: transactions[0]!.id });

      const txsAfterDeletion = await helpers.getTransactions({ raw: true });

      expect(res.statusCode).toEqual(200);
      expect(txsAfterDeletion.length).toBe(0);
    });
    it('should successfully delete both tx when deleting "to" transaction', async () => {
      const res = await helpers.deleteTransaction({ id: transactions[1]!.id });

      const txsAfterDeletion = await helpers.getTransactions({ raw: true });

      expect(res.statusCode).toEqual(200);
      expect(txsAfterDeletion.length).toBe(0);
    });
  });
  describe('transactions from external accounts', () => {
    it('cannot delete transactions from external account', async () => {
      await helpers.monobank.pair();
      const { transactions } = await helpers.monobank.mockTransactions();
      const incomeTransaction = transactions.find((item) => item.transactionType === TRANSACTION_TYPES.income);

      const res = await helpers.deleteTransaction({
        id: incomeTransaction!.id,
      });

      expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
    });
  });
});
