import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Refund Transactions service', () => {
  describe('createSingleRefund', () => {
    describe('success cases', () => {
      it('successfully creates a refund link between two transactions', async () => {
        const account = await helpers.createAccount({ raw: true });

        const [baseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        const [refundTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        const result = await helpers.createSingleRefund(
          {
            originalTxId: baseTx.id,
            refundTxId: refundTx.id,
          },
          true,
        );

        const transactions = await helpers.getTransactions({ raw: true });

        expect(result.originalTxId).toEqual(baseTx.id);
        expect(result.refundTxId).toEqual(refundTx.id);
        expect(transactions.every((tx) => tx.refundLinked)).toBe(true);
      });

      it(`successfully creates a refund link between two transactions with different currencies when:
          – refund amount LESS than base tx amount
          - refund refAmount LESS than base tx amount
      `, async () => {
        const account = await helpers.createAccount({ raw: true });
        const currencyB = global.MODELS_CURRENCIES!.find((item) => item.code === 'UAH');
        const accountB = await helpers.createAccount({
          payload: {
            ...helpers.buildAccountPayload(),
            currencyCode: currencyB.code,
          },
          raw: true,
        });

        const [baseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        const [refundTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: accountB.id,
            amount: 90,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        const result = await helpers.createSingleRefund(
          {
            originalTxId: baseTx.id,
            refundTxId: refundTx.id,
          },
          true,
        );

        expect(baseTx.currencyCode !== refundTx.currencyCode).toBe(true);
        expect(baseTx.amount > refundTx.amount).toBe(true);
        expect(baseTx.refAmount > refundTx.refAmount).toBe(true);
        expect(result.originalTxId).toEqual(baseTx.id);
        expect(result.refundTxId).toEqual(refundTx.id);
      });

      it(`successfully creates a refund link between two transactions with different currencies when:
          – refund amount BIGGER than base tx amount
          - refund refAmount LESS than base tx amount
      `, async () => {
        const account = await helpers.createAccount({ raw: true });
        const currencyB = global.MODELS_CURRENCIES!.find((item) => item.code === 'UAH');
        const accountB = await helpers.createAccount({
          payload: {
            ...helpers.buildAccountPayload(),
            currencyCode: currencyB.code,
          },
          raw: true,
        });

        const [baseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        const [refundTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: accountB.id,
            amount: 200,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        const result = await helpers.createSingleRefund(
          {
            originalTxId: baseTx.id,
            refundTxId: refundTx.id,
          },
          true,
        );

        expect(baseTx.currencyCode !== refundTx.currencyCode).toBe(true);
        expect(refundTx.amount > baseTx.amount).toBe(true);
        expect(baseTx.refAmount > refundTx.refAmount).toBe(true);
        expect(result.originalTxId).toEqual(baseTx.id);
        expect(result.refundTxId).toEqual(refundTx.id);
      });

      it('works correctly for cross-account refunds', async () => {
        const account1 = await helpers.createAccount({ raw: true });
        const account2 = await helpers.createAccount({
          payload: helpers.buildAccountPayload({ userId: account1.userId }),
          raw: true,
        });

        const [baseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account1.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        const [refundTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account2.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        const result = await helpers.createSingleRefund(
          {
            originalTxId: baseTx.id,
            refundTxId: refundTx.id,
          },
          true,
        );

        expect(baseTx.accountId !== refundTx.accountId).toBe(true);
        expect(result.originalTxId).toEqual(baseTx.id);
        expect(result.refundTxId).toEqual(refundTx.id);
      });

      it.each([
        [{ originalAmount: 100, refund1: 40, refund2: 60 }], // full refund
        [{ originalAmount: 100, refund1: 10, refund2: 20 }], // partial refund
      ])('successfully creates multiple refunds', async ({ originalAmount, refund1, refund2 }) => {
        const account = await helpers.createAccount({ raw: true });

        const [baseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: originalAmount,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        // First partial refund
        const [refundTx1] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: refund1,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        const result1 = await helpers.createSingleRefund(
          {
            originalTxId: baseTx.id,
            refundTxId: refundTx1.id,
          },
          true,
        );

        expect(result1.originalTxId).toEqual(baseTx.id);
        expect(result1.refundTxId).toEqual(refundTx1.id);

        // Second partial refund
        const [refundTx2] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: refund2,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        const result2 = await helpers.createSingleRefund(
          {
            originalTxId: baseTx.id,
            refundTxId: refundTx2.id,
          },
          true,
        );

        expect(result2.originalTxId).toEqual(baseTx.id);
        expect(result2.refundTxId).toEqual(refundTx2.id);
      });

      it('successfully creates multiple partial refunds with different currencies', async () => {
        /**
         * Create base transaction for which multiple refunds will be added. Then
         * create two refunds in different currencies.
         * The point is that second refund is in another currency with lower rate,
         * so even if we pass bigger `amount`, in fact `refAmount` will be lower,
         * and this test tests that it works as expected.
         */

        const amounts = { tx: 1_000, refund_1: 100, refund_2: 1500 };

        const account = await helpers.createAccount({ raw: true });
        const currencyB = global.MODELS_CURRENCIES!.find((item) => item.code === 'UAH');
        const accountB = await helpers.createAccount({
          payload: {
            ...helpers.buildAccountPayload(),
            currencyCode: currencyB.code,
          },
          raw: true,
        });

        const [baseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: amounts.tx,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        // First partial refund
        const [refundTx1] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: amounts.refund_1,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        await helpers.createSingleRefund({
          originalTxId: baseTx.id,
          refundTxId: refundTx1.id,
        });

        // Second partial refund with different currency
        const [refundTx2] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: accountB.id,
            amount: amounts.refund_2,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        const result = await helpers.createSingleRefund(
          {
            originalTxId: baseTx.id,
            refundTxId: refundTx2.id,
          },
          true,
        );

        expect(result.originalTxId).toEqual(baseTx.id);
        expect(result.refundTxId).toEqual(refundTx2.id);
      });

      it('successfully creates refund tx after unlinking', async () => {
        const account = await helpers.createAccount({ raw: true });

        const [baseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        const [refundTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        let creationResponse = await helpers.createSingleRefund(
          {
            originalTxId: baseTx.id,
            refundTxId: refundTx.id,
          },
          true,
        );

        expect(creationResponse.originalTxId).toEqual(baseTx.id);
        expect(creationResponse.refundTxId).toEqual(refundTx.id);

        const unlinkResponse = await helpers.deleteRefund({
          originalTxId: baseTx.id,
          refundTxId: refundTx.id,
        });

        expect(unlinkResponse.statusCode).toBe(200);

        creationResponse = await helpers.createSingleRefund(
          {
            originalTxId: baseTx.id,
            refundTxId: refundTx.id,
          },
          true,
        );

        expect(creationResponse.originalTxId).toEqual(baseTx.id);
        expect(creationResponse.refundTxId).toEqual(refundTx.id);
      });
    });

    describe('failure cases', () => {
      it(`failes to create a refund link between two transactions with different currencies when:
          - base amount BIGGER than refund amount
          - base refAmount LESS than refund refAmount
      `, async () => {
        const account = await helpers.createAccount({ raw: true });
        const accountB = await helpers.createAccount({
          payload: {
            ...helpers.buildAccountPayload(),
            // We need to use some currency with higher exchange rate, to achieve expected conditions
            currencyCode: global.MODELS_CURRENCIES!.find((item) => item.code === 'GBP').code,
          },
          raw: true,
        });

        const [baseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 1000,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        const [refundTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: accountB.id,
            amount: 950,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        const result = await helpers.createSingleRefund({
          originalTxId: baseTx.id,
          refundTxId: refundTx.id,
        });

        expect(baseTx.amount > refundTx.amount).toBe(true);
        expect(baseTx.refAmount < refundTx.refAmount).toBe(true);
        expect(result.statusCode).toEqual(ERROR_CODES.ValidationError);
        expect(helpers.extractResponse(result).message).toContain('cannot be greater');
      });

      it('fails when trying to refund with the same transaction type', async () => {
        const account = await helpers.createAccount({ raw: true });

        const [baseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        const [refundTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        const result = await helpers.createSingleRefund({
          originalTxId: baseTx.id,
          refundTxId: refundTx.id,
        });

        expect(result.statusCode).toEqual(ERROR_CODES.ValidationError);
        expect(helpers.extractResponse(result).message).toContain('opposite transaction type');
      });

      it('fails when refund amount is greater than original amount', async () => {
        const account = await helpers.createAccount({ raw: true });

        const [baseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        const [refundTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 150,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        const result = await helpers.createSingleRefund({
          originalTxId: baseTx.id,
          refundTxId: refundTx.id,
        });

        expect(result.statusCode).toEqual(ERROR_CODES.ValidationError);
        expect(helpers.extractResponse(result).message).toContain('cannot be greater than');
      });

      it('fails when total refund amount exceeds original transaction amount', async () => {
        const account = await helpers.createAccount({ raw: true });

        const [baseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        // First partial refund
        const [refundTx1] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 60,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        await helpers.createSingleRefund({
          originalTxId: baseTx.id,
          refundTxId: refundTx1.id,
        });

        // Second partial refund (which would exceed the original amount)
        const [refundTx2] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 50,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        const result = await helpers.createSingleRefund({
          originalTxId: baseTx.id,
          refundTxId: refundTx2.id,
        });

        expect(result.statusCode).toEqual(ERROR_CODES.ValidationError);
        expect(helpers.extractResponse(result).message).toContain('cannot be greater than');
      });

      it('fails when total refund amount exceeds original transaction amount with different currencies', async () => {
        const account = await helpers.createAccount({ raw: true });
        const currencyB = global.MODELS_CURRENCIES!.find((item) => item.code === 'UAH');
        const accountB = await helpers.createAccount({
          payload: {
            ...helpers.buildAccountPayload(),
            currencyCode: currencyB.code,
          },
          raw: true,
        });

        const [baseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        // First partial refund
        const [refundTx1] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 600,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        await helpers.createSingleRefund({
          originalTxId: baseTx.id,
          refundTxId: refundTx1.id,
        });

        // Second partial refund with different currency (which would exceed the original amount)
        const [refundTx2] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: accountB.id,
            amount: 10000,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        const result = await helpers.createSingleRefund({
          originalTxId: baseTx.id,
          refundTxId: refundTx2.id,
        });

        expect(result.statusCode).toEqual(ERROR_CODES.ValidationError);
        expect(helpers.extractResponse(result).message).toContain('cannot be greater than');
      });

      it('fails when trying to refund a transfer transaction', async () => {
        const account1 = await helpers.createAccount({ raw: true });
        const account2 = await helpers.createAccount({
          payload: helpers.buildAccountPayload({ userId: account1.userId }),
          raw: true,
        });

        // Create a transfer transaction
        const [baseTransferTx] = await helpers.createTransaction({
          payload: {
            ...helpers.buildTransactionPayload({
              accountId: account1.id,
              amount: 10,
              transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
              destinationAmount: 10,
              destinationAccountId: account2.id,
            }),
          },
          raw: true,
        });

        // Attempt to create a refund for the transfer
        const [refundTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account2.id,
            amount: 10,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        const result = await helpers.createSingleRefund({
          originalTxId: baseTransferTx.id,
          refundTxId: refundTx.id,
        });

        expect(result.statusCode).toEqual(ERROR_CODES.ValidationError);
        expect(helpers.extractResponse(result).message).toContain('transaction cannot be transfer');
      });

      it('fails when trying to refund a refund transaction', async () => {
        const account = await helpers.createAccount({ raw: true });

        // Create an original transaction
        const [originalTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        // Create a refund transaction
        const [refundTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        // Link the refund to the original transaction
        await helpers.createSingleRefund({
          originalTxId: originalTx.id,
          refundTxId: refundTx.id,
        });

        // Attempt to refund the refund transaction
        const [refundOfRefundTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        const result = await helpers.createSingleRefund({
          originalTxId: refundTx.id,
          refundTxId: refundOfRefundTx.id,
        });

        expect(result.statusCode).toEqual(ERROR_CODES.ValidationError);
        expect(helpers.extractResponse(result).message).toContain('Cannot refund a "refund" transaction');
      });

      it('fails when trying to link transcation to itself', async () => {
        const account1 = await helpers.createAccount({ raw: true });

        const [baseTx] = await helpers.createTransaction({
          payload: {
            ...helpers.buildTransactionPayload({
              accountId: account1.id,
              amount: 10,
              transactionType: TRANSACTION_TYPES.expense,
            }),
          },
          raw: true,
        });

        const result = await helpers.createSingleRefund({
          originalTxId: baseTx.id,
          refundTxId: baseTx.id,
        });

        expect(result.statusCode).toEqual(ERROR_CODES.ValidationError);
        expect(helpers.extractResponse(result).message).toContain('Attempt to link a single transaction to itself');
      });

      it('fails when trying to use the same refund transaction for multiple original transactions', async () => {
        const account = await helpers.createAccount({ raw: true });

        // Create two original transactions
        const [originalTx1] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        const [originalTx2] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 50,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        // Create a single refund transaction
        const [refundTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 50,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        // Link the refund to the first original transaction (should succeed)
        await helpers.createSingleRefund({
          originalTxId: originalTx1.id,
          refundTxId: refundTx.id,
        });

        // Attempt to link the same refund to the second original transaction (should fail)
        const result = await helpers.createSingleRefund({
          originalTxId: originalTx2.id,
          refundTxId: refundTx.id,
        });

        expect(result.statusCode).toEqual(ERROR_CODES.ValidationError);
        expect(helpers.extractResponse(result).message).toContain('"refundTxId" already marked as a refund');
      });
    });

    describe('nullish originalTxId cases', () => {
      describe('success cases', () => {
        it('successfully creates a refund transaction without an original transaction', async () => {
          const account = await helpers.createAccount({ raw: true });

          const [refundTx] = await helpers.createTransaction({
            payload: helpers.buildTransactionPayload({
              accountId: account.id,
              amount: 100,
              transactionType: TRANSACTION_TYPES.income,
            }),
            raw: true,
          });

          const result = await helpers.createSingleRefund(
            {
              originalTxId: null,
              refundTxId: refundTx.id,
            },
            true,
          );

          expect(result.originalTxId).toBeNull();
          expect(result.refundTxId).toEqual(refundTx.id);
        });

        it('successfully creates multiple refund transactions without original transactions', async () => {
          const account = await helpers.createAccount({ raw: true });

          const [refundTx1] = await helpers.createTransaction({
            payload: helpers.buildTransactionPayload({
              accountId: account.id,
              amount: 50,
              transactionType: TRANSACTION_TYPES.income,
            }),
            raw: true,
          });

          const [refundTx2] = await helpers.createTransaction({
            payload: helpers.buildTransactionPayload({
              accountId: account.id,
              amount: 75,
              transactionType: TRANSACTION_TYPES.income,
            }),
            raw: true,
          });

          const result1 = await helpers.createSingleRefund(
            {
              originalTxId: null,
              refundTxId: refundTx1.id,
            },
            true,
          );

          const result2 = await helpers.createSingleRefund(
            {
              originalTxId: null,
              refundTxId: refundTx2.id,
            },
            true,
          );

          expect(result1.originalTxId).toBeNull();
          expect(result1.refundTxId).toEqual(refundTx1.id);
          expect(result2.originalTxId).toBeNull();
          expect(result2.refundTxId).toEqual(refundTx2.id);
        });
      });

      describe('failure cases', () => {
        it('fails when trying to create a refund transaction with null originalTxId and transfer nature', async () => {
          const account1 = await helpers.createAccount({ raw: true });
          const account2 = await helpers.createAccount({
            payload: helpers.buildAccountPayload({ userId: account1.userId }),
            raw: true,
          });

          const [transferTx] = await helpers.createTransaction({
            payload: {
              ...helpers.buildTransactionPayload({
                accountId: account1.id,
                amount: 100,
                transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
                destinationAmount: 100,
                destinationAccountId: account2.id,
              }),
            },
            raw: true,
          });

          const result = await helpers.createSingleRefund({
            originalTxId: null,
            refundTxId: transferTx.id,
          });

          expect(result.statusCode).toEqual(ERROR_CODES.ValidationError);
          expect(helpers.extractResponse(result).message).toContain('Refund transaction cannot be a transfer one');
        });

        it('fails when trying to create a duplicate refund transaction with null originalTxId', async () => {
          const account = await helpers.createAccount({ raw: true });

          const [refundTx] = await helpers.createTransaction({
            payload: helpers.buildTransactionPayload({
              accountId: account.id,
              amount: 100,
              transactionType: TRANSACTION_TYPES.income,
            }),
            raw: true,
          });

          // First creation should succeed
          await helpers.createSingleRefund({
            originalTxId: null,
            refundTxId: refundTx.id,
          });

          // Second creation should fail
          const result = await helpers.createSingleRefund({
            originalTxId: null,
            refundTxId: refundTx.id,
          });

          expect(result.statusCode).toEqual(ERROR_CODES.ValidationError);
          expect(helpers.extractResponse(result).message).toContain('"refundTxId" already marked as a refund');
        });
      });
    });
  });
});
