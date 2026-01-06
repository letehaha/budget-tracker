import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Create transaction controller', () => {
  it('should return validation error if no data passed', async () => {
    const res = await helpers.createTransaction({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: null as any,
      raw: false,
    });

    expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
  });
  it('should successfully create a transaction base currency', async () => {
    const account = await helpers.createAccount({ raw: true });
    const txPayload = helpers.buildTransactionPayload({
      accountId: account.id,
    });
    const [baseTx] = await helpers.createTransaction({
      payload: txPayload,
      raw: true,
    });

    const transactions = await helpers.getTransactions({ raw: true });

    expect(baseTx.currencyCode).toBe(global.BASE_CURRENCY.code);
    expect(baseTx.currencyCode).toBe(global.BASE_CURRENCY.code);
    expect(baseTx.amount).toBe(txPayload.amount);
    expect(baseTx.refAmount).toBe(txPayload.amount);
    expect(baseTx.transactionType).toBe(txPayload.transactionType);
    expect(baseTx.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
    expect(baseTx).toStrictEqual(transactions![0]);
  });
  it('should successfully create a transaction for account with currency different from base one', async () => {
    // Create account with non-default currency
    const currency = global.MODELS_CURRENCIES!.find((item) => item.code === 'UAH');
    await helpers.addUserCurrencies({ currencyCodes: ['UAH'] });

    const account = await helpers.createAccount({
      payload: {
        ...helpers.buildAccountPayload(),
        currencyCode: currency.code,
      },
      raw: true,
    });

    const txPayload = helpers.buildTransactionPayload({
      accountId: account.id,
    });
    const [baseTx] = await helpers.createTransaction({
      payload: txPayload,
      raw: true,
    });

    const transactions = await helpers.getTransactions({ raw: true });
    const currencyRate = (await helpers.getCurrenciesRates()).find((c) => c.baseCode === currency.code);

    expect(baseTx.currencyCode).toBe(currency.code);
    expect(baseTx.currencyCode).toBe(currency.code);
    expect(baseTx.amount).toBe(txPayload.amount);
    expect(baseTx.refAmount).toEqualRefValue(txPayload.amount * currencyRate!.rate);
    expect(baseTx.transactionType).toBe(txPayload.transactionType);
    expect(baseTx.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
    expect(baseTx).toStrictEqual(transactions![0]);
  });
  it('should successfully create a transfer transaction between accounts with same currency', async () => {
    const accountA = await helpers.createAccount({ raw: true });
    const accountB = await helpers.createAccount({ raw: true });

    const defaultTxPayload = helpers.buildTransactionPayload({
      accountId: accountA.id,
    });
    const txPayload = {
      ...defaultTxPayload,
      transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
      destinationAmount: defaultTxPayload.amount,
      destinationAccountId: accountB.id,
    };
    const [baseTx, oppositeTx] = await helpers.createTransaction({
      payload: txPayload,
      raw: true,
    });

    const transactions = await helpers.getTransactions({ raw: true });

    expect(baseTx.currencyCode).toBe(global.BASE_CURRENCY.code);
    expect(baseTx.currencyCode).toBe(global.BASE_CURRENCY.code);

    expect(baseTx.amount).toBe(txPayload.amount);
    expect(oppositeTx!.amount).toBe(txPayload.amount);

    expect(baseTx.accountId).toBe(accountA.id);
    expect(oppositeTx!.accountId).toBe(accountB.id);

    expect(baseTx.refAmount).toBe(txPayload.amount);
    expect(oppositeTx!.refAmount).toBe(txPayload.amount);

    expect(baseTx.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);
    expect(oppositeTx!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);

    // Make sure `transferId` is the same for both transactions
    expect(baseTx.transferId).toBe(baseTx.transferId);
    expect(oppositeTx!.transferId).toBe(baseTx.transferId);

    expect(baseTx.transactionType).toBe(txPayload.transactionType);
    expect(oppositeTx!.transactionType).toBe(
      txPayload.transactionType === TRANSACTION_TYPES.expense ? TRANSACTION_TYPES.income : TRANSACTION_TYPES.expense,
    );

    expect(baseTx).toStrictEqual(transactions![0]);
  });
  it('should successfully create a transfer transaction between account with base and non-base currency', async () => {
    const accountA = await helpers.createAccount({ raw: true });

    const currencyB = global.MODELS_CURRENCIES!.find((item) => item.code === 'UAH');
    await helpers.addUserCurrencies({ currencyCodes: ['UAH'] });

    const accountB = await helpers.createAccount({
      payload: {
        ...helpers.buildAccountPayload(),
        currencyCode: currencyB.code,
      },
      raw: true,
    });

    const DESTINATION_AMOUNT = 5600;
    const txPayload = {
      ...helpers.buildTransactionPayload({ accountId: accountA.id }),
      transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
      destinationAmount: DESTINATION_AMOUNT,
      destinationAccountId: accountB.id,
    };
    const [baseTx, oppositeTx] = await helpers.createTransaction({
      payload: txPayload,
      raw: true,
    });

    const transactions = await helpers.getTransactions({ raw: true });

    expect(baseTx.currencyCode).toBe(global.BASE_CURRENCY.code);
    expect(baseTx.currencyCode).toBe(global.BASE_CURRENCY.code);

    expect(oppositeTx!.currencyCode).toBe(currencyB.code);
    expect(oppositeTx!.currencyCode).toBe(currencyB.code);

    expect(baseTx.amount).toBe(txPayload.amount);
    expect(oppositeTx!.amount).toBe(DESTINATION_AMOUNT);

    expect(baseTx.accountId).toBe(accountA.id);
    expect(oppositeTx!.accountId).toBe(accountB.id);

    // if `from` is base account, then `refAmount` stays the same
    expect(baseTx.refAmount).toBe(baseTx.amount);
    expect(oppositeTx!.refAmount).toBe(baseTx.amount);

    expect(baseTx.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);
    expect(oppositeTx!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);

    // Make sure `transferId` is the same for both transactions
    expect(baseTx.transferId).toBe(baseTx.transferId);
    expect(oppositeTx!.transferId).toBe(baseTx.transferId);

    expect(baseTx.transactionType).toBe(txPayload.transactionType);
    expect(oppositeTx!.transactionType).toBe(
      txPayload.transactionType === TRANSACTION_TYPES.expense ? TRANSACTION_TYPES.income : TRANSACTION_TYPES.expense,
    );

    [baseTx, oppositeTx].forEach((tx, i) => {
      expect(tx).toStrictEqual(transactions![i]);
    });
  });
  it('should successfully create a transfer transaction between accounts with both non-base currencies', async () => {
    const currencyA = global.MODELS_CURRENCIES!.find((item) => item.code === 'EUR');
    await helpers.addUserCurrencies({ currencyCodes: [currencyA.code] });
    const accountA = await helpers.createAccount({
      payload: {
        ...helpers.buildAccountPayload(),
        currencyCode: currencyA.code,
      },
      raw: true,
    });

    const currencyB = global.MODELS_CURRENCIES!.find((item) => item.code === 'UAH');
    await helpers.addUserCurrencies({ currencyCodes: [currencyB.code] });
    const accountB = await helpers.createAccount({
      payload: {
        ...helpers.buildAccountPayload(),
        currencyCode: currencyB.code,
      },
      raw: true,
    });

    const currencyRate = (await helpers.getCurrenciesRates()).find((c) => c.baseCode === currencyA.code);
    const oppositeCurrencyRate = (await helpers.getCurrenciesRates()).find((c) => c.baseCode === currencyB.code);

    const DESTINATION_AMOUNT = 25000;
    const txPayload = {
      ...helpers.buildTransactionPayload({ accountId: accountA.id }),
      transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
      destinationAmount: DESTINATION_AMOUNT,
      destinationAccountId: accountB.id,
    };
    const [baseTx, oppositeTx] = await helpers.createTransaction({
      payload: txPayload,
      raw: true,
    });

    const transactions = await helpers.getTransactions({ raw: true });

    expect(baseTx.currencyCode).toBe(currencyA.code);
    expect(baseTx.currencyCode).toBe(currencyA.code);

    expect(oppositeTx!.currencyCode).toBe(currencyB.code);
    expect(oppositeTx!.currencyCode).toBe(currencyB.code);

    expect(baseTx.amount).toBe(txPayload.amount);
    expect(oppositeTx!.amount).toBe(DESTINATION_AMOUNT);

    expect(baseTx.accountId).toBe(accountA.id);
    expect(oppositeTx!.accountId).toBe(accountB.id);

    // Secondary (`to`) transfer tx always same `refAmount` as the general (`from`) tx to keep it consistent
    expect(baseTx.refAmount).toEqualRefValue(baseTx.amount * currencyRate!.rate);
    expect(oppositeTx!.refAmount).toEqualRefValue(oppositeTx!.amount * oppositeCurrencyRate!.rate);

    expect(baseTx.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);
    expect(oppositeTx!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);

    // Make sure `transferId` is the same for both transactions
    expect(baseTx.transferId).toBe(baseTx.transferId);
    expect(oppositeTx!.transferId).toBe(baseTx.transferId);

    expect(baseTx.transactionType).toBe(txPayload.transactionType);
    expect(oppositeTx!.transactionType).toBe(
      txPayload.transactionType === TRANSACTION_TYPES.expense ? TRANSACTION_TYPES.income : TRANSACTION_TYPES.expense,
    );

    [baseTx, oppositeTx].forEach((tx, i) => {
      expect(tx).toStrictEqual(transactions![i]);
    });
  });
  describe('create transfer via linking', () => {
    it('link with system transaction', async () => {
      const accountA = await helpers.createAccount({ raw: true });
      const accountB = await helpers.createAccount({ raw: true });
      const expectedValues = {
        destinationTransaction: {
          transactionType: TRANSACTION_TYPES.income,
          accountId: accountA.id,
        },
        baseTransaction: {
          amount: 100,
          accountId: accountB.id,
        },
      };
      const txPayload = helpers.buildTransactionPayload({
        ...expectedValues.destinationTransaction,
      });
      const [destinationTx] = await helpers.createTransaction({
        payload: txPayload,
        raw: true,
      });

      const transferTxPayload = helpers.buildTransactionPayload({
        accountId: expectedValues.baseTransaction.accountId,
        amount: expectedValues.baseTransaction.amount,
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
        destinationTransactionId: destinationTx.id,
      });

      const [baseTx, oppositeTx] = await helpers.createTransaction({
        payload: transferTxPayload,
        raw: true,
      });

      const transactions = await helpers.getTransactions({ raw: true });

      expect(transactions?.length).toBe(2);
      expect(baseTx.transferId).toBe(oppositeTx!.transferId);
      expect(oppositeTx!.amount).toBe(destinationTx.amount);
      expect(baseTx.amount).toBe(expectedValues.baseTransaction.amount);
      expect(baseTx.transactionType).toBe(TRANSACTION_TYPES.expense);
      expect(oppositeTx!.transactionType).toBe(expectedValues.destinationTransaction.transactionType);
    });
    it.each([[TRANSACTION_TYPES.expense], [TRANSACTION_TYPES.income]])(
      'link with external %s transaction',
      async (txType) => {
        await helpers.monobank.pair();
        const { transactions } = await helpers.monobank.mockTransactions();
        const externalTransaction = transactions.find((item) => item.transactionType === txType);
        const accountA = await helpers.createAccount({ raw: true });
        const expectedValues = {
          accountId: accountA.id,
          amount: 50,
          transactionType: txType === TRANSACTION_TYPES.expense ? TRANSACTION_TYPES.income : TRANSACTION_TYPES.expense,
        };
        const transferTxPayload = helpers.buildTransactionPayload({
          ...expectedValues,
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          destinationTransactionId: externalTransaction!.id,
        });

        const [baseTx, oppositeTx] = await helpers.createTransaction({
          payload: transferTxPayload,
          raw: true,
        });

        expect(baseTx.transferId).toBe(oppositeTx!.transferId);
        expect(oppositeTx!.amount).toBe(externalTransaction!.amount);
        expect(baseTx.amount).toBe(expectedValues.amount);
      },
    );
    it('throws an error when trying to link tx with same transactionType', async () => {
      const accountA = await helpers.createAccount({ raw: true });
      const accountB = await helpers.createAccount({ raw: true });

      const transactionType = TRANSACTION_TYPES.income;

      const [destinationTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          transactionType,
          accountId: accountA.id,
        }),
        raw: true,
      });

      const transferTxPayload = helpers.buildTransactionPayload({
        accountId: accountB.id,
        transactionType,
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
        destinationTransactionId: destinationTx.id,
      });

      const result = await helpers.createTransaction({
        payload: transferTxPayload,
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });
    it('throws an error when trying to link tx from the same account', async () => {
      const accountA = await helpers.createAccount({ raw: true });

      const [destinationTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          transactionType: TRANSACTION_TYPES.income,
          accountId: accountA.id,
        }),
        raw: true,
      });

      const transferTxPayload = helpers.buildTransactionPayload({
        accountId: accountA.id,
        transactionType: TRANSACTION_TYPES.expense,
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
        destinationTransactionId: destinationTx.id,
      });

      const result = await helpers.createTransaction({
        payload: transferTxPayload,
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });
    it('throws an error when trying to link to the transaction that is already a transfer', async () => {
      const accountA = await helpers.createAccount({ raw: true });
      const accountB = await helpers.createAccount({ raw: true });

      const defaultTxPayload = helpers.buildTransactionPayload({
        accountId: accountA.id,
      });
      const txPayload = {
        ...defaultTxPayload,
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
        destinationAmount: defaultTxPayload.amount,
        destinationAccountId: accountB.id,
      };
      const [, oppositeTx] = await helpers.createTransaction({
        payload: txPayload,
        raw: true,
      });

      const accountC = await helpers.createAccount({ raw: true });

      const transferTxPayload = helpers.buildTransactionPayload({
        accountId: accountC.id,
        transactionType: TRANSACTION_TYPES.expense,
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
        destinationTransactionId: oppositeTx!.id,
      });

      const result = await helpers.createTransaction({
        payload: transferTxPayload,
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });
  describe('Create refund transaction', () => {
    it('should successfully create a refund transaction', async () => {
      const account = await helpers.createAccount({ raw: true });
      const originalTxPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        transactionType: TRANSACTION_TYPES.expense,
      });
      const [originalTx] = await helpers.createTransaction({
        payload: originalTxPayload,
        raw: true,
      });

      const refundTxPayload = {
        ...helpers.buildTransactionPayload({
          accountId: account.id,
          transactionType: TRANSACTION_TYPES.income,
        }),
        refundForTxId: originalTx.id,
      };
      const [refundTx] = await helpers.createTransaction({
        payload: refundTxPayload,
        raw: true,
      });

      const refundResponse = await helpers.getSingleRefund({
        originalTxId: originalTx.id,
        refundTxId: refundTx.id,
      });

      expect(refundTx.amount).toBe(refundTxPayload.amount);
      expect(refundTx.transactionType).toBe(TRANSACTION_TYPES.income);
      // Check that refund was successfully created
      expect(refundResponse.statusCode).toBe(200);
    });

    it('should throw an error when trying to create a refund for non-existent transaction', async () => {
      const account = await helpers.createAccount({ raw: true });
      const refundTxPayload = {
        ...helpers.buildTransactionPayload({
          accountId: account.id,
          transactionType: TRANSACTION_TYPES.income,
        }),
        refundForTxId: 99999, // Non-existent ID
      };

      const result = await helpers.createTransaction({
        payload: refundTxPayload,
      });

      expect(result.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('should not allow creating a refund for a transaction that is already a transfer', async () => {
      const accountA = await helpers.createAccount({ raw: true });
      const accountB = await helpers.createAccount({ raw: true });

      const transferTxPayload = {
        ...helpers.buildTransactionPayload({
          accountId: accountA.id,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
        destinationAmount: 100,
        destinationAccountId: accountB.id,
      };
      const [transferTx] = await helpers.createTransaction({
        payload: transferTxPayload,
        raw: true,
      });

      const refundTxPayload = {
        ...helpers.buildTransactionPayload({
          accountId: accountA.id,
          transactionType: TRANSACTION_TYPES.income,
        }),
        refundForTxId: transferTx.id,
      };

      const result = await helpers.createTransaction({
        payload: refundTxPayload,
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should not allow creating a refund with transferNature', async () => {
      const account = await helpers.createAccount({ raw: true });
      const originalTxPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        transactionType: TRANSACTION_TYPES.expense,
      });
      const [originalTx] = await helpers.createTransaction({
        payload: originalTxPayload,
        raw: true,
      });

      const refundTxPayload = {
        ...helpers.buildTransactionPayload({
          accountId: account.id,
          transactionType: TRANSACTION_TYPES.income,
        }),
        refundForTxId: originalTx.id,
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
      };

      const result = await helpers.createTransaction({
        payload: refundTxPayload,
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });
});
