import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('out_of_wallet transfer', () => {
  describe('transaction creation', () => {
    it.each([[TRANSACTION_TYPES.income], [TRANSACTION_TYPES.expense]])(
      'successfully creates record for %s scenario',
      async (txType) => {
        const account = await helpers.createAccount({ raw: true });

        const txPayload = helpers.buildTransactionPayload({
          accountId: account.id,
          transactionType: txType,
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
        });
        const [baseTx, oppositeTx] = await helpers.createTransaction({
          payload: txPayload,
          raw: true,
        });

        const account_after = await helpers.getAccount({ id: account.id, raw: true });

        if (txType === TRANSACTION_TYPES.income) {
          expect(account_after.currentBalance).toBe(Number(account.currentBalance) + txPayload.amount);
        } else if (txType === TRANSACTION_TYPES.expense) {
          expect(account_after.currentBalance).toBe(Number(account.currentBalance) - txPayload.amount);
        }

        expect(oppositeTx).toBe(undefined); // there's no opposite transaction when out_of_wallet created

        expect(baseTx.accountId).toBe(account.id);
        expect(baseTx.currencyCode).toBe(account.currencyCode);
        expect(baseTx.amount).toBe(txPayload.amount);
      },
    );
    it('it ignores `destinationAmount` if provided', async () => {
      const account = await helpers.createAccount({ raw: true });

      const defaultTxPayload = helpers.buildTransactionPayload({
        accountId: account.id,
      });

      const txPayload = {
        ...defaultTxPayload,
        transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
        destinationAmount: defaultTxPayload.amount,
      };
      const [baseTx] = await helpers.createTransaction({
        payload: txPayload,
        raw: true,
      });

      expect(baseTx.amount).toBe(txPayload.amount);
    });

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
    it.each([[TRANSACTION_TYPES.income], [TRANSACTION_TYPES.expense]])(
      'successfully deletes record for %s scenario',
      async (txType) => {
        const account = await helpers.createAccount({ raw: true });

        const [createdTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            transactionType: txType,
            transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
          }),
          raw: true,
        });

        const response = await helpers.deleteTransaction({ id: createdTx.id });

        expect(response.statusCode).toBe(200);

        const account_after = await helpers.getAccount({ id: account.id, raw: true });

        expect(account_after.currentBalance).toBe(account.currentBalance);
      },
    );
  });
});
