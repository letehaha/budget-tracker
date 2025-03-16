import { TRANSACTION_TYPES } from '@bt/shared/types';
import {
  buildOutOfWalletTransaction,
  buildSystemExpenseTransaction,
  buildSystemIncomeTransaction,
  buildSystemTransferExpenseTransaction,
} from '@tests/mocks';

import { getDestinationAmount, getFormTypeFromTransaction, getTxTypeFromFormType } from './helpers';
import { FORM_TYPES } from './types';

describe('components/modals/modify-record/helpers', () => {
  describe('getDestinationAmount', () => {
    test.each([
      [[10, 20, false, false, buildSystemIncomeTransaction()], 10],
      [[10, 20, false, true, buildSystemIncomeTransaction()], 10],
      [[10, 20, true, false, buildSystemIncomeTransaction()], 20],

      [[10, 20, false, false, buildSystemExpenseTransaction()], 10],
      [[10, 20, false, true, buildSystemExpenseTransaction()], 20],
      [[10, 20, true, false, buildSystemExpenseTransaction()], 20],
    ])('%s to be %s', (args, expected) => {
      expect(
        getDestinationAmount({
          fromAmount: args[0],
          toAmount: args[1],
          isCurrenciesDifferent: args[2],
          isRecordExternal: args[3],
          sourceTransaction: args[4],
        }),
      ).toBe(expected);
    });
  });

  describe('getFormTypeFromTransaction', () => {
    test.each([
      [buildSystemIncomeTransaction(), FORM_TYPES.income],
      [buildSystemExpenseTransaction(), FORM_TYPES.expense],
      [buildSystemTransferExpenseTransaction(), FORM_TYPES.transfer],
      [buildOutOfWalletTransaction(), FORM_TYPES.transfer],
    ])('%s to be %s', (value, expected) => {
      expect(getFormTypeFromTransaction(value)).toBe(expected);
    });
  });

  describe('getTxTypeFromFormType', () => {
    test.each([
      [FORM_TYPES.income, TRANSACTION_TYPES.income],
      [FORM_TYPES.expense, TRANSACTION_TYPES.expense],
      [FORM_TYPES.transfer, TRANSACTION_TYPES.expense],
    ])('%s to be %s', (value, expected) => {
      expect(getTxTypeFromFormType(value)).toBe(expected);
    });
  });
});
