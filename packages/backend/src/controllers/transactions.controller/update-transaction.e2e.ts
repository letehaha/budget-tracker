import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { faker } from '@faker-js/faker';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import { EXTERNAL_ACCOUNT_RESTRICTED_UPDATION_FIELDS } from '@services/transactions/update-transaction';
import * as helpers from '@tests/helpers';

describe('Update transaction controller', () => {
  it('should make basic updation', async () => {
    const [baseTx] = await helpers.createTransaction({ raw: true });
    const txAmount = baseTx.amount;
    const expectedNewAmount = txAmount + 1000;

    const res = await helpers.updateTransaction({
      id: baseTx.id,
      payload: {
        amount: expectedNewAmount,
        transactionType: TRANSACTION_TYPES.income,
      },
      raw: true,
    });

    const txsAfterUpdation = (await helpers.getTransactions({ raw: true }))!;

    expect(res[0]).toStrictEqual(txsAfterUpdation[0]);
    expect(res[0].amount).toStrictEqual(expectedNewAmount);
    expect(res[0].transactionType).toStrictEqual(TRANSACTION_TYPES.income);
  });
  it('should change account (so and currency) and update refAmount correctly', async () => {
    const [createdTransaction] = await helpers.createTransaction({ raw: true });

    const { account: accountUAH, currencyRate } = await helpers.createAccountWithNewCurrency({
      currency: 'UAH',
    });

    const [baseTx] = await helpers.updateTransaction({
      id: createdTransaction.id,
      payload: {
        transactionType: TRANSACTION_TYPES.income,
        accountId: accountUAH.id,
      },
      raw: true,
    });

    expect(baseTx.accountId).toStrictEqual(accountUAH.id);
    expect(baseTx.amount).toStrictEqual(createdTransaction.amount);
    expect(baseTx.refAmount).toStrictEqual(Math.floor(createdTransaction.amount * currencyRate!.rate));
  });
  it('should create transfer tx for ref + non-ref tx, and change destination non-ref account to another non-ref account', async () => {
    const baseAccount = await helpers.createAccount({ raw: true });
    const { account: accountUAH } = await helpers.createAccountWithNewCurrency({
      currency: 'UAH',
    });

    const [baseTx, oppositeTx] = await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({
          accountId: baseAccount.id,
          amount: 10,
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          destinationAmount: 20,
          destinationAccountId: accountUAH.id,
        }),
      },
      raw: true,
    });

    // Even if the currencyRate between USD and UAH has a huge difference, non-ref
    // tx should always have refAmount same as ref tx in case of transfer
    expect(oppositeTx!.refAmount).toEqual(baseTx.refAmount);

    const { account: accountEUR, currency: currencyEUR } = await helpers.createAccountWithNewCurrency({
      currency: 'EUR',
    });
    const [, newOppositeTx] = await helpers.updateTransaction({
      id: baseTx.id,
      payload: {
        destinationAccountId: accountEUR.id,
      },
      raw: true,
    });

    expect(newOppositeTx).toMatchObject({
      // We only changed account, so amounts should stay same
      amount: oppositeTx!.amount,
      refAmount: oppositeTx!.refAmount,
      // accountId and currencyCode are changed
      accountId: accountEUR.id,
      currencyCode: currencyEUR.code,
    });
  });
  it.each([[TRANSACTION_TYPES.income], [TRANSACTION_TYPES.expense]])(
    'should change %s to transfer and vice versa',
    async (txType) => {
      const accountA = await helpers.createAccount({ raw: true });
      const accountB = await helpers.createAccount({ raw: true });

      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: accountA.id,
          transactionType: txType,
        }),
        raw: true,
      });

      await helpers.updateTransaction({
        id: tx.id,
        payload: {
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          destinationAmount: 30,
          destinationAccountId: accountB.id,
        },
        raw: true,
      });

      await helpers.updateTransaction({
        id: tx.id,
        payload: {
          transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
        },
        raw: true,
      });

      const transactions = (await helpers.getTransactions({ raw: true }))!;

      expect(transactions.length).toBe(1);
      expect(transactions[0]).toEqual(tx);
    },
  );

  describe('test refAmount is correct when changing transfer transaction accounts to ref account', () => {
    it('EUR->UAH to EUR->USD, refAmount should be same as amount of USD. Because USD is a ref-currency', async () => {
      const { account: accountEUR } = await helpers.createAccountWithNewCurrency({
        currency: 'EUR',
      });
      const { account: accountUAH } = await helpers.createAccountWithNewCurrency({
        currency: 'UAH',
      });
      const accountUSD = await helpers.createAccount({ raw: true });

      const [baseTx] = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: accountEUR.id,
            amount: 1000,
            transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
            destinationAmount: 2000,
            destinationAccountId: accountUAH.id,
          }),
        },
        raw: true,
      });

      const [updatedBaseTx, updatedOppositeTx] = await helpers.updateTransaction({
        id: baseTx.id,
        payload: {
          destinationAccountId: accountUSD.id,
          destinationAmount: 1000,
        },
        raw: true,
      });

      expect(updatedOppositeTx!.amount).toEqual(updatedOppositeTx!.refAmount);
      expect(updatedBaseTx.refAmount).toEqual(updatedOppositeTx!.refAmount);
    });
    it('UAH->EUR to USD->EUR, refAmount should be same as amount of USD. Because USD is a ref-currency', async () => {
      const { account: accountEUR } = await helpers.createAccountWithNewCurrency({
        currency: 'EUR',
      });
      const { account: accountUAH } = await helpers.createAccountWithNewCurrency({
        currency: 'UAH',
      });
      const accountUSD = await helpers.createAccount({ raw: true });

      const [baseTx, oppositeTx] = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: accountUAH.id,
            amount: 40000,
            transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
            destinationAmount: 1000,
            destinationAccountId: accountEUR.id,
          }),
        },
        raw: true,
      });

      // Change base tx account to USD, amount makes same as refAmount
      // opposite tx amount stays as previous, but refAmount makes same as base tx
      const [updatedBaseTx, updatedOppositeTx] = await helpers.updateTransaction({
        id: baseTx.id,
        payload: {
          accountId: accountUSD.id,
          amount: 2500,
        },
        raw: true,
      });

      expect(updatedBaseTx.amount).toEqual(updatedBaseTx.refAmount);
      expect(updatedOppositeTx!.amount).toEqual(oppositeTx!.amount);
      expect(updatedOppositeTx!.refAmount).toEqual(updatedBaseTx.refAmount);
    });
  });

  describe('updates external transactions to transfer and vice versa', () => {
    it.each([[TRANSACTION_TYPES.expense], [TRANSACTION_TYPES.income]])(
      'updates from %s to transfer and back',
      async (transactionType) => {
        await helpers.monobank.pair();
        const { transactions } = await helpers.monobank.mockTransactions();

        const externalTransaction = transactions.find((item) => item.transactionType === transactionType);
        expect(externalTransaction).not.toBe(undefined);

        const accountB = await helpers.createAccount({
          raw: true,
        });

        const [baseTx, oppositeTx] = await helpers.updateTransaction({
          id: externalTransaction!.id,
          payload: {
            transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
            destinationAccountId: accountB.id,
            destinationAmount: externalTransaction!.refAmount,
          },
          raw: true,
        });
        const transferId = baseTx.transferId;

        const checkBalanceIsCorrect = async (expected) => {
          const balanceHistory = await helpers.makeRequest({
            method: 'get',
            url: '/stats/balance-history',
            raw: true,
          });
          // Find opposite tx that should be created at the same date as the base tx
          const externalTxBalanceRecord = balanceHistory.find(
            (item) =>
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              item.amount === (externalTransaction!.externalData as any).balance,
          );
          const newTxBalanceRecord = balanceHistory.find(
            (item) => item.date === externalTxBalanceRecord.date && item.accountId === oppositeTx!.accountId,
          );

          expect(newTxBalanceRecord.amount).toBe(
            expected === 0 ? 0 : oppositeTx!.transactionType === TRANSACTION_TYPES.expense ? -expected : expected,
          );
        };

        expect(baseTx).toMatchObject({
          amount: externalTransaction!.amount,
          refAmount: externalTransaction!.refAmount,
          accountId: externalTransaction!.accountId,
          transferId,
          transactionType: transactionType,
        });
        expect(oppositeTx).toMatchObject({
          amount: externalTransaction!.refAmount,
          refAmount: externalTransaction!.refAmount,
          transferId,
          accountId: accountB.id,
          transactionType:
            transactionType === TRANSACTION_TYPES.expense ? TRANSACTION_TYPES.income : TRANSACTION_TYPES.expense,
        });

        await checkBalanceIsCorrect(externalTransaction!.refAmount);

        // Now update it back to be non-transfer one
        await helpers.updateTransaction({
          id: externalTransaction!.id,
          payload: {
            transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
          },
          raw: true,
        });

        await checkBalanceIsCorrect(0);

        const transactionsAfterUpdate = (await helpers.getTransactions({
          raw: true,
        }))!;

        // Check that opposite tx is deleted
        expect(transactionsAfterUpdate.find((i) => i.id === oppositeTx!.id)).toBe(undefined);
        // Check that base tx doesn't have transferId anymore
        expect(transactionsAfterUpdate.find((i) => i.id === baseTx.id)!.transferId).toBe(null);
      },
    );
    it.each([[TRANSACTION_TYPES.expense], [TRANSACTION_TYPES.income]])(
      'updates external %s to transfer_out_wallet without transactionType',
      async (transactionType) => {
        await helpers.monobank.pair();
        const { transactions } = await helpers.monobank.mockTransactions();

        const externalTransaction = transactions.find((item) => item.transactionType === transactionType);
        expect(externalTransaction).not.toBe(undefined);

        // Update external transaction to transfer_out_wallet
        const [baseTx] = await helpers.updateTransaction({
          id: externalTransaction!.id,
          payload: {
            transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
          },
          raw: true,
        });

        // Verify that the transaction was updated to transfer_out_wallet
        expect(baseTx).toMatchObject({
          amount: externalTransaction!.amount,
          refAmount: externalTransaction!.refAmount,
          accountId: externalTransaction!.accountId,
          transferId: null,
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
          // transactionType should remain the same as the original
          transactionType: transactionType,
        });

        // Verify no opposite transaction is created for out_of_wallet
        const allTransactions = (await helpers.getTransactions({ raw: true }))!;
        expect(allTransactions.length).toBe(transactions.length);
      },
    );

    it('throws error when trying to make invalid actions', async () => {
      await helpers.monobank.pair();
      const { transactions } = await helpers.monobank.mockTransactions();

      const incomeTransaction = transactions.find((item) => item.transactionType === TRANSACTION_TYPES.income);
      const expenseTransaction = transactions.find((item) => item.transactionType === TRANSACTION_TYPES.expense);

      // when trying to update "transactionType" of the external account
      const result_a = await helpers.updateTransaction({
        id: incomeTransaction!.id,
        payload: { transactionType: TRANSACTION_TYPES.expense },
      });
      expect(result_a.statusCode).toEqual(ERROR_CODES.ValidationError);

      const result_b = await helpers.updateTransaction({
        id: expenseTransaction!.id,
        payload: { transactionType: TRANSACTION_TYPES.income },
      });
      expect(result_b.statusCode).toEqual(ERROR_CODES.ValidationError);

      const mockedData = {
        amount: faker.number.int({ max: 10000, min: 0 }),
        time: faker.date.anytime(),
        transactionType: TRANSACTION_TYPES.expense,
        accountId: faker.number.int({ max: 10000, min: 0 }),
      };

      // Trying to update some of restricted fields
      for (const field of EXTERNAL_ACCOUNT_RESTRICTED_UPDATION_FIELDS) {
        const res = await helpers.updateTransaction({
          id: expenseTransaction!.id,
          payload: { [field]: mockedData[field] },
        });
        expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
      }
    });
  });

  describe('link transactions between each other', () => {
    it.each([[TRANSACTION_TYPES.expense], [TRANSACTION_TYPES.income]])(
      'update %s to transfer when linking',
      async (txType) => {
        const accountA = await helpers.createAccount({ raw: true });
        const accountB = await helpers.createAccount({ raw: true });

        const oppositeTxType =
          txType === TRANSACTION_TYPES.income ? TRANSACTION_TYPES.expense : TRANSACTION_TYPES.income;

        const [tx1] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: accountA.id,
            transactionType: txType,
          }),
          raw: true,
        });
        const [tx2] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: accountB.id,
            transactionType: oppositeTxType,
          }),
          raw: true,
        });

        await helpers.updateTransaction({
          id: tx1.id,
          payload: {
            transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
            destinationTransactionId: tx2.id,
          },
        });

        const txsAfterUpdation = (await helpers.getTransactions({ raw: true }))!;

        const tx1AfterUpdation = txsAfterUpdation.find((item) => item.id === tx1.id);
        const tx2AfterUpdation = txsAfterUpdation.find((item) => item.id === tx2.id);

        [
          [tx1, tx1AfterUpdation],
          [tx2, tx2AfterUpdation],
        ].forEach(([tx, txAfter]) => {
          // Expect that only transferNature and transferId were changed
          expect({ ...tx }).toEqual({
            ...txAfter,
            transferNature: expect.toBeAnythingOrNull(),
            transferId: expect.toBeAnythingOrNull(),
          });

          expect(txAfter!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);
          expect(txAfter!.transferId).toEqual(expect.any(String));
        });

        expect(tx1AfterUpdation!.transferId).toBe(tx2AfterUpdation!.transferId);
      },
    );

    it.each([[TRANSACTION_TYPES.expense], [TRANSACTION_TYPES.income]])(
      'throws an error when trying to link tx from the same account',
      async (txType) => {
        const oppositeTxType =
          txType === TRANSACTION_TYPES.income ? TRANSACTION_TYPES.expense : TRANSACTION_TYPES.income;

        await helpers.monobank.pair();
        const { transactions } = await helpers.monobank.mockTransactions();

        const tx1 = transactions.find((item) => item.transactionType === txType);
        const tx2 = transactions.find((item) => item.transactionType === oppositeTxType);

        const result = await helpers.updateTransaction({
          id: tx1!.id,
          payload: {
            transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
            destinationTransactionId: tx2!.id,
          },
        });
        expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
      },
    );

    it.each([[TRANSACTION_TYPES.expense], [TRANSACTION_TYPES.income]])(
      'throws an error when trying to link tx with same transactionType. test %s type',
      async (txType) => {
        const accountA = await helpers.createAccount({ raw: true });
        const accountB = await helpers.createAccount({ raw: true });

        const [tx1] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: accountA.id,
            transactionType: txType,
          }),
          raw: true,
        });
        const [tx2] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: accountB.id,
            transactionType: txType,
          }),
          raw: true,
        });

        const result = await helpers.updateTransaction({
          id: tx1.id,
          payload: {
            transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
            destinationTransactionId: tx2.id,
          },
        });

        expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
      },
    );

    it.each([[TRANSACTION_TYPES.expense], [TRANSACTION_TYPES.income]])(
      'throws an error when trying to link to the transaction that is already a transfer. test %s type',
      async (txType) => {
        const accountA = await helpers.createAccount({ raw: true });
        const accountB = await helpers.createAccount({ raw: true });
        const accountC = await helpers.createAccount({ raw: true });

        const [tx1] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: accountA.id,
            transactionType: txType,
          }),
          raw: true,
        });
        const transactions = await helpers.createTransaction({
          payload: {
            ...helpers.buildTransactionPayload({
              accountId: accountB.id,
              amount: 10,
              transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
              destinationAmount: 20,
              destinationAccountId: accountC.id,
            }),
          },
          raw: true,
        });

        const expenseTx = transactions.find((t) => t!.transactionType === TRANSACTION_TYPES.expense);
        const incomeTx = transactions.find((t) => t!.transactionType === TRANSACTION_TYPES.income);

        const result = await helpers.updateTransaction({
          id: tx1.id,
          payload: {
            transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
            destinationTransactionId: txType === TRANSACTION_TYPES.income ? expenseTx!.id : incomeTx!.id,
          },
        });

        expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
      },
    );

    it.each([[TRANSACTION_TYPES.expense], [TRANSACTION_TYPES.income]])(
      'update transfer of two linked transactions back to their initial state will just remove the opposite tx. testing %s',
      async (txType) => {
        const accountA = await helpers.createAccount({ raw: true });
        const accountB = await helpers.createAccount({ raw: true });

        const oppositeTxType =
          txType === TRANSACTION_TYPES.income ? TRANSACTION_TYPES.expense : TRANSACTION_TYPES.income;

        const [tx1] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: accountA.id,
            transactionType: txType,
          }),
          raw: true,
        });
        const [tx2] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: accountB.id,
            transactionType: oppositeTxType,
          }),
          raw: true,
        });

        await helpers.updateTransaction({
          id: tx1.id,
          payload: {
            transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
            destinationTransactionId: tx2.id,
          },
        });

        await helpers.updateTransaction({
          id: tx1.id,
          payload: {
            transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
          },
        });

        const txsAfterUpdation = (await helpers.getTransactions({ raw: true }))!;

        expect(txsAfterUpdation.length).toBe(1);
        expect(txsAfterUpdation[0]).toEqual(tx1);
      },
    );
  });

  describe('refunds', () => {
    const createTransaction = async (txType: TRANSACTION_TYPES, amount: number) => {
      const account = await helpers.createAccount({ raw: true });
      const [tx] = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({ accountId: account.id }),
          transactionType: txType,
          amount,
        },
        raw: true,
      });
      return tx;
    };
    const scenarios = [
      {
        originalType: TRANSACTION_TYPES.expense,
        refundType: TRANSACTION_TYPES.income,
      },
      {
        originalType: TRANSACTION_TYPES.income,
        refundType: TRANSACTION_TYPES.expense,
      },
    ];

    it('fails when trying to update both refundsTxId, and refundedBy', async () => {
      const originalTx = await createTransaction(TRANSACTION_TYPES.expense, 1000);
      const refundTx = await createTransaction(TRANSACTION_TYPES.income, 500);
      const response = await helpers.updateTransaction({
        id: refundTx.id,
        payload: {
          refundsTxId: originalTx.id,
          refundedByTxIds: [originalTx.id],
        },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('change from refundsTxId to refundedByTxIds', async () => {
      const [original, refund] = await Promise.all([
        // Use the same amount, so transactions can refund another in both directions
        createTransaction(TRANSACTION_TYPES.expense, 500),
        createTransaction(TRANSACTION_TYPES.income, 500),
      ]);

      // Set up initial refund relationship
      await helpers.updateTransaction({
        id: refund.id,
        payload: {
          refundsTxId: original.id,
        },
      });

      const initialRefund = await helpers.getSingleRefund({
        originalTxId: original.id,
        refundTxId: refund.id,
      });
      expect(initialRefund.statusCode).toBe(200);

      // Change to new refundedByTxIds format
      const [updatedOriginalTx] = await helpers.updateTransaction({
        id: refund.id,
        payload: {
          refundedByTxIds: [original.id],
        },
        raw: true,
      });
      expect(updatedOriginalTx.refundLinked).toBe(true);

      const oldRefund = await helpers.getSingleRefund({
        originalTxId: original.id,
        refundTxId: refund.id,
      });
      expect(oldRefund.statusCode).toBe(ERROR_CODES.NotFoundError);
      const newRefund = await helpers.getSingleRefund({
        originalTxId: refund.id,
        refundTxId: original.id,
      });
      expect(newRefund.statusCode).toBe(200);
    });

    describe('transaction refunds another transaction', () => {
      it.each(scenarios)(
        'refunds another transaction in default conditions ($originalType -> $refundType)',
        async ({ originalType, refundType }) => {
          const originalTx = await createTransaction(originalType, 1000);
          const refundTx = await createTransaction(refundType, 500);
          const [updatedOriginalTx] = await helpers.updateTransaction({
            id: refundTx.id,
            payload: {
              refundsTxId: originalTx.id,
            },
            raw: true,
          });

          const refund = await helpers.getSingleRefund({
            originalTxId: originalTx.id,
            refundTxId: refundTx.id,
          });

          const transactions = (await helpers.getTransactions({ raw: true }))!.filter((t) =>
            [originalTx.id, refundTx.id].includes(t.id),
          );

          expect(refund.statusCode).toBe(200);
          expect(updatedOriginalTx.refundLinked).toBe(true);
          expect(transactions.every((i) => !!i.refundLinked)).toBe(true);
        },
      );

      it.each(scenarios)(
        'should unlink refund transaction when refundsTxId is null ($originalType -> $refundType)',
        async ({ originalType, refundType }) => {
          const originalTx = await createTransaction(originalType, 1000);
          const refundTx = await createTransaction(refundType, 500);

          await helpers.updateTransaction({
            id: refundTx.id,
            payload: {
              refundsTxId: originalTx.id,
            },
            raw: true,
          });

          let transactions = (await helpers.getTransactions({ raw: true }))!.filter((t) =>
            [originalTx.id, refundTx.id].includes(t.id),
          );

          expect(transactions.every((i) => !!i.refundLinked)).toBe(true);

          await helpers.updateTransaction({
            id: refundTx.id,
            payload: {
              refundsTxId: null,
            },
            raw: true,
          });

          transactions = (await helpers.getTransactions({ raw: true }))!.filter((t) =>
            [originalTx.id, refundTx.id].includes(t.id),
          );
          const refund = await helpers.getSingleRefund({
            originalTxId: originalTx.id,
            refundTxId: refundTx.id,
          });

          expect(refund.statusCode).toBe(ERROR_CODES.NotFoundError);
          expect(transactions.every((i) => !!i.refundLinked)).toBe(false);
        },
      );

      it.each(scenarios)(
        'should change refund transaction when a new one is provided ($originalType -> $refundType)',
        async ({ originalType, refundType }) => {
          const originalTx1 = await createTransaction(originalType, 1000);
          const originalTx2 = await createTransaction(originalType, 500);
          const refundTx = await createTransaction(refundType, 500);

          await helpers.updateTransaction({
            id: refundTx.id,
            payload: {
              refundsTxId: originalTx1.id,
            },
            raw: true,
          });

          await helpers.updateTransaction({
            id: refundTx.id,
            payload: {
              refundsTxId: originalTx2.id,
            },
            raw: true,
          });

          const oldRefund = await helpers.getSingleRefund({
            originalTxId: originalTx1.id,
            refundTxId: refundTx.id,
          });
          expect(oldRefund.statusCode).toBe(ERROR_CODES.NotFoundError);

          const newRefund = await helpers.getSingleRefund({
            originalTxId: originalTx2.id,
            refundTxId: refundTx.id,
          });
          expect(newRefund.statusCode).toBe(200);

          const transactions = (await helpers.getTransactions({ raw: true }))!;

          // Test that previously refunded tx is now not marked as a refund
          expect(transactions.find((i) => i.id === originalTx1.id)!.refundLinked).toBe(false);
          expect(transactions.find((t) => [refundTx.id, originalTx2.id].includes(t.id))!.refundLinked).toBe(true);
        },
      );
    });

    describe('transaction refunded by many others', () => {
      const createTransaction = async (txType, amount) => {
        const account = await helpers.createAccount({ raw: true });
        const [tx] = await helpers.createTransaction({
          payload: {
            ...helpers.buildTransactionPayload({ accountId: account.id }),
            transactionType: txType,
            amount,
          },
          raw: true,
        });
        return tx;
      };

      it.each(scenarios)(
        'links multiple refund transactions ($originalType -> $refundType)',
        async ({ originalType, refundType }) => {
          const [originalTx, refundTx1, refundTx2] = await Promise.all([
            createTransaction(originalType, 1000),
            createTransaction(refundType, 500),
            createTransaction(refundType, 500),
          ]);

          const [updatedOriginalTx] = await helpers.updateTransaction({
            id: originalTx.id,
            payload: {
              refundedByTxIds: [refundTx1.id, refundTx2.id],
            },
            raw: true,
          });

          const refunds = await Promise.all([
            helpers.getSingleRefund({
              originalTxId: originalTx.id,
              refundTxId: refundTx1.id,
            }),
            helpers.getSingleRefund({
              originalTxId: originalTx.id,
              refundTxId: refundTx2.id,
            }),
          ]);

          const transactions = (await helpers.getTransactions({ raw: true }))!;

          expect(refunds.every((r) => r.statusCode === 200)).toBe(true);
          expect(updatedOriginalTx.refundLinked).toBe(true);
          expect(
            transactions
              .filter((t) => [originalTx.id, refundTx1.id, refundTx2.id].includes(t.id))
              .every((t) => t.refundLinked),
          ).toBe(true);
        },
      );

      it.each(scenarios)(
        'unlinks multiple refund transactions when refundedByTxIds is null ($originalType -> $refundType)',
        async ({ originalType, refundType }) => {
          const [originalTx, refundTx1, refundTx2] = await Promise.all([
            createTransaction(originalType, 1000),
            createTransaction(refundType, 500),
            createTransaction(refundType, 500),
          ]);

          await helpers.updateTransaction({
            id: originalTx.id,
            payload: {
              refundedByTxIds: [refundTx1.id, refundTx2.id],
            },
          });

          await helpers.updateTransaction({
            id: originalTx.id,
            payload: {
              refundedByTxIds: null,
            },
            raw: true,
          });

          const refunds = await Promise.all([
            helpers.getSingleRefund({
              originalTxId: originalTx.id,
              refundTxId: refundTx1.id,
            }),
            helpers.getSingleRefund({
              originalTxId: originalTx.id,
              refundTxId: refundTx2.id,
            }),
          ]);

          const transactions = (await helpers.getTransactions({ raw: true }))!;

          expect(refunds.every((r) => r.statusCode === ERROR_CODES.NotFoundError)).toBe(true);
          expect(
            transactions
              .filter((t) => [originalTx.id, refundTx1.id, refundTx2.id].includes(t.id))
              .every((t) => !t.refundLinked),
          ).toBe(true);
        },
      );

      it.each(scenarios)(
        'changes refund transactions when new array is provided ($originalType -> $refundType)',
        async ({ originalType, refundType }) => {
          const [originalTx, refundTx1, refundTx2, refundTx3] = await Promise.all([
            createTransaction(originalType, 1000),
            createTransaction(refundType, 300),
            createTransaction(refundType, 300),
            createTransaction(refundType, 400),
          ]);

          await helpers.updateTransaction({
            id: originalTx.id,
            payload: {
              refundedByTxIds: [refundTx1.id, refundTx2.id],
            },
          });

          await helpers.updateTransaction({
            id: originalTx.id,
            payload: {
              refundedByTxIds: [refundTx2.id, refundTx3.id],
            },
          });

          const refunds = await Promise.all([
            helpers.getSingleRefund({
              originalTxId: originalTx.id,
              refundTxId: refundTx1.id,
            }),
            helpers.getSingleRefund({
              originalTxId: originalTx.id,
              refundTxId: refundTx2.id,
            }),
            helpers.getSingleRefund({
              originalTxId: originalTx.id,
              refundTxId: refundTx3.id,
            }),
          ]);

          expect(refunds[0].statusCode).toBe(ERROR_CODES.NotFoundError);
          expect(refunds[1].statusCode).toBe(200);
          expect(refunds[2].statusCode).toBe(200);
        },
      );

      it.each(scenarios)(
        'does not allow refunds exceeding original transaction amount ($originalType -> $refundType)',
        async ({ originalType, refundType }) => {
          const [originalTx, refundTx1, refundTx2, refundTx3] = await Promise.all([
            createTransaction(originalType, 1000),
            createTransaction(refundType, 500),
            createTransaction(refundType, 500),
            createTransaction(refundType, 100),
          ]);

          const response = await helpers.updateTransaction({
            id: originalTx.id,
            payload: {
              refundedByTxIds: [refundTx1.id, refundTx2.id, refundTx3.id],
            },
          });

          expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
        },
      );

      it.each(scenarios)(
        'does not allow refunds with incorrect transaction type ($originalType -> $refundType)',
        async ({ originalType, refundType }) => {
          const [originalTx, refundTx1, refundTx2] = await Promise.all([
            createTransaction(originalType, 1000),
            createTransaction(originalType, 500),
            createTransaction(refundType, 500),
          ]);

          const response = await helpers.updateTransaction({
            id: originalTx.id,
            payload: {
              refundedByTxIds: [refundTx1.id, refundTx2.id],
            },
          });

          expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
        },
      );
    });
  });
});
