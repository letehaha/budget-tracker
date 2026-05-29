import { ACCOUNT_CATEGORIES, TRANSACTION_TYPES } from '@bt/shared/types';
import * as helpers from '@tests/helpers';
import { format, subDays } from 'date-fns';

describe('[Stats] Credit limit in statistics', () => {
  describe('getTotalBalance with credit limit setting', () => {
    it('does NOT subtract credit limit by default (setting off)', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({
          accountCategory: ACCOUNT_CATEGORIES.creditCard,
          initialBalance: 5000,
          creditLimit: 3000,
        }),
        raw: true,
      });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.income,
          time: new Date().toISOString(),
        }),
        raw: true,
      });

      const today = format(new Date(), 'yyyy-MM-dd');
      const totalBalance = await helpers.getTotalBalance({ date: today, raw: true });

      // Without the setting, total balance = currentBalance (no credit limit subtracted)
      // The total includes the initial balance + income
      expect(totalBalance).toBe(5100);
    });

    it('subtracts credit limit when setting is enabled', async () => {
      await helpers.updateUserSettings({
        raw: true,
        settings: { locale: 'en', includeCreditLimitInStats: true },
      });

      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({
          accountCategory: ACCOUNT_CATEGORIES.creditCard,
          initialBalance: 5000,
          creditLimit: 3000,
        }),
        raw: true,
      });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.income,
          time: new Date().toISOString(),
        }),
        raw: true,
      });

      const today = format(new Date(), 'yyyy-MM-dd');
      const totalBalance = await helpers.getTotalBalance({ date: today, raw: true });

      // With the setting on: currentBalance (5100) - creditLimit (3000) = 2100
      expect(totalBalance).toBe(2100);
    });

    it('only subtracts credit limit for accounts with creditLimit > 0', async () => {
      await helpers.updateUserSettings({
        raw: true,
        settings: { locale: 'en', includeCreditLimitInStats: true },
      });

      // Account with credit limit
      const creditAccount = await helpers.createAccount({
        payload: helpers.buildAccountPayload({
          accountCategory: ACCOUNT_CATEGORIES.creditCard,
          initialBalance: 5000,
          creditLimit: 3000,
        }),
        raw: true,
      });

      // Regular account without credit limit
      const regularAccount = await helpers.createAccount({
        payload: helpers.buildAccountPayload({
          accountCategory: ACCOUNT_CATEGORIES.general,
          initialBalance: 2000,
          creditLimit: 0,
        }),
        raw: true,
      });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: creditAccount.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.income,
          time: new Date().toISOString(),
        }),
        raw: true,
      });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: regularAccount.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.income,
          time: new Date().toISOString(),
        }),
        raw: true,
      });

      const today = format(new Date(), 'yyyy-MM-dd');
      const totalBalance = await helpers.getTotalBalance({ date: today, raw: true });

      // creditAccount: 5100 - 3000 = 2100
      // regularAccount: 2100 (no credit limit to subtract)
      // Total: 4200
      expect(totalBalance).toBe(4200);
    });

    it('respects excludeFromStats for credit limit accounts', async () => {
      await helpers.updateUserSettings({
        raw: true,
        settings: { locale: 'en', includeCreditLimitInStats: true },
      });

      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({
          accountCategory: ACCOUNT_CATEGORIES.creditCard,
          initialBalance: 5000,
          creditLimit: 3000,
        }),
        raw: true,
      });

      // Exclude from stats
      await helpers.updateAccount({
        id: account.id,
        payload: { excludeFromStats: true },
        raw: true,
      });

      const today = format(new Date(), 'yyyy-MM-dd');
      const totalBalance = await helpers.getTotalBalance({ date: today, raw: true });

      // Excluded accounts contribute neither balance nor credit limit adjustment
      expect(totalBalance).toBe(0);
    });

    it('stops subtracting credit limit after setting is toggled back to false', async () => {
      // Enable the setting
      await helpers.updateUserSettings({
        raw: true,
        settings: { locale: 'en', includeCreditLimitInStats: true },
      });

      await helpers.createAccount({
        payload: helpers.buildAccountPayload({
          accountCategory: ACCOUNT_CATEGORIES.creditCard,
          initialBalance: 5000,
          creditLimit: 3000,
        }),
        raw: true,
      });

      const today = format(new Date(), 'yyyy-MM-dd');

      // Verify subtraction is active
      const balanceWithSetting = await helpers.getTotalBalance({ date: today, raw: true });
      expect(balanceWithSetting).toBe(2000); // 5000 - 3000

      // Disable the setting
      await helpers.updateUserSettings({
        raw: true,
        settings: { locale: 'en', includeCreditLimitInStats: false },
      });

      // Verify subtraction is no longer applied
      const balanceWithoutSetting = await helpers.getTotalBalance({ date: today, raw: true });
      expect(balanceWithoutSetting).toBe(5000);
    });

    it('does not adjust balance when setting is enabled but no accounts have credit limits', async () => {
      await helpers.updateUserSettings({
        raw: true,
        settings: { locale: 'en', includeCreditLimitInStats: true },
      });

      await helpers.createAccount({
        payload: helpers.buildAccountPayload({
          accountCategory: ACCOUNT_CATEGORIES.general,
          initialBalance: 3000,
          creditLimit: 0,
        }),
        raw: true,
      });

      const today = format(new Date(), 'yyyy-MM-dd');
      const totalBalance = await helpers.getTotalBalance({ date: today, raw: true });

      // No credit limit accounts, so balance is unchanged
      expect(totalBalance).toBe(3000);
    });

    it('uses refCreditLimit (base currency) for non-base-currency accounts', async () => {
      await helpers.updateUserSettings({
        raw: true,
        settings: { locale: 'en', includeCreditLimitInStats: true },
      });

      // Create a foreign currency account with a credit limit set at creation
      const { account } = await helpers.createAccountWithNewCurrency({
        currency: 'EUR',
      });

      // Update the account to have a credit limit
      await helpers.updateAccount({
        id: account.id,
        payload: { creditLimit: 1000 },
        raw: true,
      });

      // Re-fetch account to get updated refCreditLimit
      const updatedAccount = await helpers.getAccount({ id: account.id, raw: true });

      const today = format(new Date(), 'yyyy-MM-dd');
      const totalBalance = await helpers.getTotalBalance({ date: today, raw: true });

      // Credit limit doesn't affect balance, so refCurrentBalance stays at 0 (initial).
      // Stats should subtract refCreditLimit (base currency), not creditLimit (EUR).
      const refLimit = Number(updatedAccount.refCreditLimit);
      expect(refLimit).toBeGreaterThan(0);
      // totalBalance = balance record (refInitialBalance=0) - refCreditLimit
      expect(totalBalance).toBe(0 - refLimit);
    });
  });

  describe('getCombinedBalanceHistory with credit limit setting', () => {
    it('does NOT adjust balances by default', async () => {
      await helpers.createAccount({
        payload: helpers.buildAccountPayload({
          accountCategory: ACCOUNT_CATEGORIES.creditCard,
          initialBalance: 5000,
          creditLimit: 3000,
        }),
        raw: true,
      });

      const fromDate = format(subDays(new Date(), 7), 'yyyy-MM-dd');
      const toDate = format(new Date(), 'yyyy-MM-dd');

      const data = await helpers.getCombinedBalanceHistory({
        from: fromDate,
        to: toDate,
        raw: true,
      });

      expect(data.length).toBeGreaterThan(0);

      // Without setting, accountsBalance should be the raw balance (5000)
      const lastEntry = data[data.length - 1]!;
      expect(lastEntry.accountsBalance).toBe(5000);
      expect(lastEntry.totalBalance).toBe(5000);
    });

    it('subtracts credit limit from all entries when setting is enabled', async () => {
      await helpers.updateUserSettings({
        raw: true,
        settings: { locale: 'en', includeCreditLimitInStats: true },
      });

      await helpers.createAccount({
        payload: helpers.buildAccountPayload({
          accountCategory: ACCOUNT_CATEGORIES.creditCard,
          initialBalance: 5000,
          creditLimit: 3000,
        }),
        raw: true,
      });

      const fromDate = format(subDays(new Date(), 7), 'yyyy-MM-dd');
      const toDate = format(new Date(), 'yyyy-MM-dd');

      const data = await helpers.getCombinedBalanceHistory({
        from: fromDate,
        to: toDate,
        raw: true,
      });

      expect(data.length).toBeGreaterThan(0);

      // With setting on, all entries should have credit limit subtracted
      for (const entry of data) {
        expect(entry.accountsBalance).toBe(2000); // 5000 - 3000
        expect(entry.totalBalance).toBe(2000);
      }
    });

    it('handles multiple accounts with different credit limits', async () => {
      await helpers.updateUserSettings({
        raw: true,
        settings: { locale: 'en', includeCreditLimitInStats: true },
      });

      await helpers.createAccount({
        payload: helpers.buildAccountPayload({
          accountCategory: ACCOUNT_CATEGORIES.creditCard,
          initialBalance: 5000,
          creditLimit: 3000,
        }),
        raw: true,
      });

      await helpers.createAccount({
        payload: helpers.buildAccountPayload({
          accountCategory: ACCOUNT_CATEGORIES.creditCard,
          initialBalance: 2000,
          creditLimit: 1000,
        }),
        raw: true,
      });

      const fromDate = format(subDays(new Date(), 7), 'yyyy-MM-dd');
      const toDate = format(new Date(), 'yyyy-MM-dd');

      const data = await helpers.getCombinedBalanceHistory({
        from: fromDate,
        to: toDate,
        raw: true,
      });

      expect(data.length).toBeGreaterThan(0);

      // Account 1: 5000 - 3000 = 2000, Account 2: 2000 - 1000 = 1000, Total: 3000
      const lastEntry = data[data.length - 1]!;
      expect(lastEntry.accountsBalance).toBe(3000);
      expect(lastEntry.totalBalance).toBe(3000);
    });

    it('excludes both balance and credit limit for excludeFromStats accounts', async () => {
      await helpers.updateUserSettings({
        raw: true,
        settings: { locale: 'en', includeCreditLimitInStats: true },
      });

      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({
          accountCategory: ACCOUNT_CATEGORIES.creditCard,
          initialBalance: 5000,
          creditLimit: 3000,
        }),
        raw: true,
      });

      // Exclude from stats
      await helpers.updateAccount({
        id: account.id,
        payload: { excludeFromStats: true },
        raw: true,
      });

      const fromDate = format(subDays(new Date(), 7), 'yyyy-MM-dd');
      const toDate = format(new Date(), 'yyyy-MM-dd');

      const data = await helpers.getCombinedBalanceHistory({
        from: fromDate,
        to: toDate,
        raw: true,
      });

      // Excluded account contributes neither balance nor credit limit adjustment
      // With no other accounts, the combined history should be empty
      expect(data).toEqual([]);
    });
  });
});
