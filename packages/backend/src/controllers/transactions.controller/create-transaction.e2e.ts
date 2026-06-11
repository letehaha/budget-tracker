import {
  CATEGORIZATION_MODE,
  CATEGORIZATION_SOURCE,
  type RecordId,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
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

  it('should reject negative amount', async () => {
    const account = await helpers.createAccount({ raw: true });

    const res = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: -100,
      }),
      raw: false,
    });

    expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
  });

  it('should reject zero amount', async () => {
    const account = await helpers.createAccount({ raw: true });

    const res = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 0,
      }),
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
  it('accepts transaction amounts above the legacy 32-bit INTEGER ceiling', async () => {
    // Regression: SequelizeDatabaseError "value … is out of range for type integer".
    // 25_000_000 decimal → 2_500_000_000 cents, above the old 2_147_483_647 cap.
    // Common for low-denomination currencies (IDR, VND).
    const LARGE_AMOUNT = 25_000_000;
    const LARGE_COMMISSION = 50_000;

    const account = await helpers.createAccount({ raw: true });

    const txPayload = helpers.buildTransactionPayload({
      accountId: account.id,
      amount: LARGE_AMOUNT,
      commissionRate: LARGE_COMMISSION,
    });
    const [baseTx] = await helpers.createTransaction({
      payload: txPayload,
      raw: true,
    });

    expect(baseTx.amount).toBe(LARGE_AMOUNT);
    expect(baseTx.refAmount).toBe(LARGE_AMOUNT);
    expect(baseTx.commissionRate).toBe(LARGE_COMMISSION);
    expect(baseTx.refCommissionRate).toBe(LARGE_COMMISSION);

    const accountAfter = await helpers.getAccount({ id: account.id, raw: true });
    // default account starts at 0 balance; expense subtracts LARGE_AMOUNT
    expect(accountAfter.currentBalance).toBe(-LARGE_AMOUNT);
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

    expect(transactions).toContainEqual(baseTx);
    expect(transactions).toContainEqual(oppositeTx);
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

    [baseTx, oppositeTx].forEach((tx) => {
      expect(transactions).toContainEqual(tx);
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
    expect(baseTx.refAmount).toEqualRefValue(Number(baseTx.amount) * currencyRate!.rate);
    expect(oppositeTx!.refAmount).toEqualRefValue(Number(oppositeTx!.amount) * oppositeCurrencyRate!.rate);

    expect(baseTx.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);
    expect(oppositeTx!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);

    // Make sure `transferId` is the same for both transactions
    expect(baseTx.transferId).toBe(baseTx.transferId);
    expect(oppositeTx!.transferId).toBe(baseTx.transferId);

    expect(baseTx.transactionType).toBe(txPayload.transactionType);
    expect(oppositeTx!.transactionType).toBe(
      txPayload.transactionType === TRANSACTION_TYPES.expense ? TRANSACTION_TYPES.income : TRANSACTION_TYPES.expense,
    );

    [baseTx, oppositeTx].forEach((tx) => {
      expect(transactions).toContainEqual(tx);
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
        refundForTxId: generateRandomRecordId(), // Non-existent ID
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

  describe('Payee linking', () => {
    it('stores the caller-supplied payeeId on the transaction', async () => {
      const account = await helpers.createAccount({ raw: true });
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Linked Co' }),
        raw: true,
      });

      const [tx] = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({ accountId: account.id }),
          payeeId: payee.id,
        },
        raw: true,
      });

      expect(tx.payeeId).toBe(payee.id);
      // Without explicit payeeLocked, the row defaults to unlocked even when a
      // payee is attached — locking is a separate, intentional gesture (manual
      // override).
      expect(tx.payeeLocked).toBe(false);
    });

    it('stores payeeLocked=true when the caller passes it explicitly', async () => {
      const account = await helpers.createAccount({ raw: true });
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Locked Co' }),
        raw: true,
      });

      const [tx] = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({ accountId: account.id }),
          payeeId: payee.id,
          payeeLocked: true,
        },
        raw: true,
      });

      expect(tx.payeeId).toBe(payee.id);
      expect(tx.payeeLocked).toBe(true);
    });

    it('applies the payee defaultCategoryId via payee_rule auto-categorization', async () => {
      // The caller passes a different categoryId than the payee's default —
      // the payee_rule pass should overwrite it because the row carries no
      // higher-precedence categorizationMeta source.
      const account = await helpers.createAccount({ raw: true });
      const otherCategory = await helpers.addCustomCategory({
        raw: true,
        name: `Other Cat ${Date.now()}`,
        color: '#ffffff',
      });
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({
          name: 'CatRule Co',
          defaultCategoryId: global.DEFAULT_CATEGORY_ID,
        }),
        raw: true,
      });

      const [tx] = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: account.id,
            categoryId: otherCategory.id,
          }),
          payeeId: payee.id,
        },
        raw: true,
      });

      expect(tx.payeeId).toBe(payee.id);
      expect(tx.categoryId).toBe(global.DEFAULT_CATEGORY_ID);
    });

    it('with mode=enforce, stamps categorizationMeta.source=payee_rule so AI skips the row', async () => {
      const account = await helpers.createAccount({ raw: true });
      const otherCategory = await helpers.addCustomCategory({
        raw: true,
        name: `Enforce Other Cat ${Date.now()}`,
        color: '#ffffff',
      });
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({
          name: 'EnforceMode Co',
          defaultCategoryId: global.DEFAULT_CATEGORY_ID,
          categorizationMode: CATEGORIZATION_MODE.enforce,
        }),
        raw: true,
      });

      const [tx] = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: account.id,
            categoryId: otherCategory.id,
          }),
          payeeId: payee.id,
        },
        raw: true,
      });

      expect(tx.categoryId).toBe(global.DEFAULT_CATEGORY_ID);
      expect(tx.categorizationMeta?.source).toBe(CATEGORIZATION_SOURCE.payeeRule);
    });

    it('with mode=hint, applies the default category but leaves categorizationMeta null', async () => {
      // `hint` is the "Amazon iPhone vs Garden tool" case — the Payee provides
      // a reasonable starting category, but AI is still free to override based
      // on the transaction's own details. The null meta is the signal AI's
      // listener uses to decide it may run.
      const account = await helpers.createAccount({ raw: true });
      const otherCategory = await helpers.addCustomCategory({
        raw: true,
        name: `Hint Other Cat ${Date.now()}`,
        color: '#ffffff',
      });
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({
          name: 'HintMode Co',
          defaultCategoryId: global.DEFAULT_CATEGORY_ID,
          categorizationMode: CATEGORIZATION_MODE.hint,
        }),
        raw: true,
      });

      const [tx] = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: account.id,
            categoryId: otherCategory.id,
          }),
          payeeId: payee.id,
        },
        raw: true,
      });

      expect(tx.categoryId).toBe(global.DEFAULT_CATEGORY_ID);
      expect(tx.categorizationMeta).toBeNull();
    });

    it('with mode=off, leaves both categoryId and categorizationMeta untouched', async () => {
      const account = await helpers.createAccount({ raw: true });
      const otherCategory = await helpers.addCustomCategory({
        raw: true,
        name: `Off Other Cat ${Date.now()}`,
        color: '#ffffff',
      });
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({
          name: 'OffMode Co',
          defaultCategoryId: global.DEFAULT_CATEGORY_ID,
          categorizationMode: CATEGORIZATION_MODE.off,
        }),
        raw: true,
      });

      const [tx] = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: account.id,
            categoryId: otherCategory.id,
          }),
          payeeId: payee.id,
        },
        raw: true,
      });

      // Payee is still linked — only the categorization side is disabled.
      expect(tx.payeeId).toBe(payee.id);
      expect(tx.categoryId).toBe(otherCategory.id);
      expect(tx.categorizationMeta).toBeNull();
    });

    it('rejects a foreign-user payeeId with 404 (cross-user injection guard)', async () => {
      // The DB FK on `Transactions.payeeId` only references `Payees(id)`, not
      // `(id, userId)`. Without the service-layer guard, any caller could
      // stamp a foreign user's Payee onto their own row. Verify the guard
      // throws NotFoundError instead of silently linking.
      const secondUser = await helpers.signUpSecondUser();
      let foreignPayeeId: RecordId | null = null;
      await helpers.asUser({
        cookies: secondUser.cookies,
        fn: async () => {
          await helpers.setBaseCurrencyForActiveUser({ currencyCode: global.BASE_CURRENCY.code });
          const payee = await helpers.createPayee({
            payload: helpers.buildPayeePayload({ name: `Foreign Co ${Date.now()}` }),
            raw: true,
          });
          foreignPayeeId = payee.id;
        },
      });

      const account = await helpers.createAccount({ raw: true });
      const result = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({ accountId: account.id }),
          payeeId: foreignPayeeId!,
        },
        raw: false,
      });

      expect(result.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('leaves categoryId untouched when the payee has no defaultCategoryId', async () => {
      const account = await helpers.createAccount({ raw: true });
      const otherCategory = await helpers.addCustomCategory({
        raw: true,
        name: `Untouched Cat ${Date.now()}`,
        color: '#ffffff',
      });
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'NoDefault Co' }),
        raw: true,
      });

      const [tx] = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: account.id,
            categoryId: otherCategory.id,
          }),
          payeeId: payee.id,
        },
        raw: true,
      });

      expect(tx.payeeId).toBe(payee.id);
      expect(tx.categoryId).toBe(otherCategory.id);
    });
  });
});
