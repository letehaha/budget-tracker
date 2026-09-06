import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('out_of_wallet transfer', () => {
  describe('transaction creation', () => {
    it('successfully creates income and expense records, ignoring `destinationAmount`', async () => {
      const accountA = await helpers.createAccount({ raw: true });
      const accountB = await helpers.createAccount({ raw: true });

      const incomePayload = helpers.buildTransactionPayload({
        accountId: accountA.id,
        transactionType: TRANSACTION_TYPES.income,
        transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
      });
      const [incomeTx, incomeOppositeTx] = await helpers.createTransaction({
        payload: incomePayload,
        raw: true,
      });

      const expenseDefaults = helpers.buildTransactionPayload({
        accountId: accountB.id,
        transactionType: TRANSACTION_TYPES.expense,
        transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
      });
      const expensePayload = { ...expenseDefaults, destinationAmount: expenseDefaults.amount };
      const [expenseTx, expenseOppositeTx] = await helpers.createTransaction({
        payload: expensePayload,
        raw: true,
      });

      // there's no opposite transaction when out_of_wallet created
      expect(incomeOppositeTx).toBe(undefined);
      expect(expenseOppositeTx).toBe(undefined);

      expect(incomeTx.accountId).toBe(accountA.id);
      expect(incomeTx.currencyCode).toBe(accountA.currencyCode);
      expect(incomeTx.amount).toBe(incomePayload.amount);

      expect(expenseTx.accountId).toBe(accountB.id);
      expect(expenseTx.currencyCode).toBe(accountB.currencyCode);
      expect(expenseTx.amount).toBe(expensePayload.amount);

      const accountA_after = await helpers.getAccount({ id: accountA.id, raw: true });
      const accountB_after = await helpers.getAccount({ id: accountB.id, raw: true });

      expect(accountA_after.currentBalance).toBe(Number(accountA.currentBalance) + incomePayload.amount);
      expect(accountB_after.currentBalance).toBe(Number(accountB.currentBalance) - expensePayload.amount);
    }, 60_000);

    it('it throws validation error when `destinationAccountId` is provided', async () => {
      const account = await helpers.createAccount({ raw: true });
      const accountB = await helpers.createAccount({ raw: true });

      const defaultTxPayload = helpers.buildTransactionPayload({
        accountId: account.id,
      });

      const txPayload = {
        ...defaultTxPayload,
        transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
        destinationAmount: defaultTxPayload.amount,
        destinationAccountId: accountB.id,
      };
      const response = await helpers.createTransaction({
        payload: txPayload,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });

  describe('transaction updation', () => {
    it.each([[TRANSACTION_TYPES.income], [TRANSACTION_TYPES.expense]])(
      'successfully updates record for %s scenario',
      async (txType) => {
        const accountA = await helpers.createAccount({ raw: true });

        const txPayload = helpers.buildTransactionPayload({
          accountId: accountA.id,
          transactionType: txType,
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
        });

        const [createdTx] = await helpers.createTransaction({
          payload: txPayload,
          raw: true,
        });

        const accountB = await helpers.createAccount({ raw: true });

        const newAmount = 3000;
        const [updatedTx] = await helpers.updateTransaction({
          raw: true,
          payload: { amount: newAmount, accountId: accountB.id },
          id: createdTx.id,
        });

        const accountA_after = await helpers.getAccount({ id: accountA.id, raw: true });
        const accountB_after = await helpers.getAccount({ id: accountB.id, raw: true });

        // after record updation, old account balance reset to the previous state
        expect(accountA.currentBalance).toBe(accountA_after.currentBalance);

        if (txType === TRANSACTION_TYPES.income) {
          expect(accountB_after.currentBalance).toBe(Number(accountB.currentBalance) + Number(updatedTx.amount));
        } else if (txType === TRANSACTION_TYPES.expense) {
          expect(accountB_after.currentBalance).toBe(Number(accountB.currentBalance) - Number(updatedTx.amount));
        }

        expect(updatedTx.amount).toBe(newAmount);
      },
    );
  });

  describe('transaction deletion', () => {
    it('successfully deletes income and expense records and restores both balances', async () => {
      const accountA = await helpers.createAccount({ raw: true });
      const accountB = await helpers.createAccount({ raw: true });

      const [incomeTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: accountA.id,
          transactionType: TRANSACTION_TYPES.income,
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
        }),
        raw: true,
      });
      const [expenseTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: accountB.id,
          transactionType: TRANSACTION_TYPES.expense,
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
        }),
        raw: true,
      });

      expect((await helpers.deleteTransaction({ id: incomeTx.id })).statusCode).toBe(200);
      expect((await helpers.deleteTransaction({ id: expenseTx.id })).statusCode).toBe(200);

      const accountA_after = await helpers.getAccount({ id: accountA.id, raw: true });
      const accountB_after = await helpers.getAccount({ id: accountB.id, raw: true });

      expect(accountA_after.currentBalance).toBe(accountA.currentBalance);
      expect(accountB_after.currentBalance).toBe(accountB.currentBalance);
    }, 60_000);
  });
});
