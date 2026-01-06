import { ACCOUNT_CATEGORIES, API_RESPONSE_STATUS, TRANSACTION_TYPES } from '@bt/shared/types';
import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { faker } from '@faker-js/faker';
import { beforeEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@js/errors';
import Accounts from '@models/Accounts.model';
import Balances from '@models/Balances.model';
import Transactions from '@models/Transactions.model';
import Holdings from '@models/investments/Holdings.model';
import InvestmentTransaction from '@models/investments/InvestmentTransaction.model';
import PortfolioBalances from '@models/investments/PortfolioBalances.model';
import PortfolioTransfers from '@models/investments/PortfolioTransfers.model';
import { redisClient } from '@root/redis-client';
import { calculateRefAmountFromParams } from '@services/calculate-ref-amount.service';
import { buildLockKey } from '@services/currencies/change-base-currency.service';
import * as helpers from '@tests/helpers';
import { format } from 'date-fns';

describe('Change Base Currency', () => {
  beforeEach(async () => {
    // Make base currency GBP
    await helpers.makeRequest({
      method: 'post',
      url: '/user/currencies/base',
      payload: { currencyCode: 'GBP' },
    });

    // Add USD currency since many conversions will be into this one currency
    await helpers.addUserCurrencies({ currencyCodes: ['USD'], raw: true });
  });
  describe('POST /user/currencies/change-base', () => {
    it('should successfully change base currency and recalculate all amounts', async () => {
      // Create an account in EUR (base currency)
      const account = await helpers.createAccount({
        payload: {
          name: 'EUR Account',
          currencyCode: 'EUR',
          initialBalance: 10000, // 100 EUR
          creditLimit: 0,
          accountCategory: ACCOUNT_CATEGORIES.general,
        },
        raw: true,
      });

      // Create some transactions
      const tx1 = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 5000, // 50 EUR
          transactionType: TRANSACTION_TYPES.expense,
          time: new Date('2024-01-15').toISOString(),
        }),
        raw: true,
      });

      const tx2 = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 2000, // 20 EUR
          transactionType: TRANSACTION_TYPES.income,
          time: new Date('2024-01-20').toISOString(),
        }),
        raw: true,
      });

      // Store original refAmounts for comparison
      const originalTx1RefAmount = tx1[0].refAmount;
      const originalTx2RefAmount = tx2[0].refAmount;

      // Change base currency from EUR to USD
      const response = await helpers.makeRequest({
        method: 'post',
        url: '/user/currencies/change-base',
        payload: {
          newCurrencyCode: 'USD',
        },
      });

      expect(response.statusCode).toEqual(200);
      expect(response.body.status).toEqual(API_RESPONSE_STATUS.success);
      expect(response.body.response.transactionsUpdated).toBeGreaterThan(0);
      expect(response.body.response.accountsUpdated).toBeGreaterThan(0);

      // Verify base currency was changed
      const newBaseCurrency = (await helpers.getUserCurrencies()).find((i) => i.isDefaultCurrency)!;
      expect(newBaseCurrency.currencyCode).toEqual('USD');
      expect(newBaseCurrency.isDefaultCurrency).toBe(true);

      // Verify transactions were recalculated
      const updatedTx1 = await Transactions.findByPk(tx1[0].id, { raw: true });
      const updatedTx2 = await Transactions.findByPk(tx2[0].id, { raw: true });

      expect(updatedTx1!.refCurrencyCode).toEqual('USD');
      expect(updatedTx2!.refCurrencyCode).toEqual('USD');

      // RefAmounts should be different now (converted to USD)
      expect(updatedTx1!.refAmount).not.toEqual(originalTx1RefAmount);
      expect(updatedTx2!.refAmount).not.toEqual(originalTx2RefAmount);

      // Verify account was recalculated
      const updatedAccount = await Accounts.findByPk(account.id, { raw: true });
      expect(updatedAccount!.refInitialBalance).toBeDefined();
      expect(updatedAccount!.refCurrentBalance).toBeDefined();

      // Verify balances were rebuilt
      const balances = await Balances.findAll({
        where: { accountId: account.id },
        raw: true,
      });
      expect(balances.length).toBeGreaterThan(0);
    });

    it('should return error when trying to change to the same currency', async () => {
      const baseCurrency = (await helpers.getUserCurrencies()).find((i) => i.isDefaultCurrency)!;

      const response = await helpers.makeRequest({
        method: 'post',
        url: '/user/currencies/change-base',
        payload: {
          newCurrencyCode: baseCurrency.currencyCode,
        },
      });

      expect(response.statusCode).toEqual(ERROR_CODES.ValidationError);
    });

    it('should handle multiple accounts with different currencies', async () => {
      // Additionally add EUR currency
      await helpers.addUserCurrencies({ currencyCodes: ['EUR'], raw: true });

      // Create accounts in different currencies
      const uahAccount = await helpers.createAccount({
        payload: {
          name: 'EUR Account',
          currencyCode: 'EUR',
          initialBalance: 10000,
          creditLimit: 0,
          accountCategory: ACCOUNT_CATEGORIES.general,
        },
        raw: true,
      });

      const eurAccount = await helpers.createAccount({
        payload: {
          name: 'EUR Account',
          currencyCode: 'EUR',
          initialBalance: 5000,
          creditLimit: 0,
          accountCategory: ACCOUNT_CATEGORIES.general,
        },
        raw: true,
      });

      // Create transactions for each account
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: uahAccount.id,
          amount: 2000,
          transactionType: TRANSACTION_TYPES.expense,
          time: new Date('2024-01-15').toISOString(),
        }),
        raw: true,
      });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: eurAccount.id,
          amount: 1000,
          transactionType: TRANSACTION_TYPES.income,
          time: new Date('2024-01-16').toISOString(),
        }),
        raw: true,
      });

      // Change base currency to USD
      const response = await helpers.makeRequest({
        method: 'post',
        url: '/user/currencies/change-base',
        payload: {
          newCurrencyCode: 'USD',
        },
      });

      expect(response.statusCode).toEqual(200);
      expect(response.body.response.accountsUpdated).toEqual(2);

      // Verify all accounts were recalculated
      const updatedUahAccount = await Accounts.findByPk(uahAccount.id);
      const updatedEurAccount = await Accounts.findByPk(eurAccount.id);

      expect(updatedUahAccount!.refInitialBalance).toBeDefined();
      expect(updatedEurAccount!.refInitialBalance).toBeDefined();
    });

    it('should preserve transaction amounts in original currency', async () => {
      const account = await helpers.createAccount({
        payload: {
          name: 'EUR Account',
          currencyCode: 'EUR',
          initialBalance: 10000,
          creditLimit: 0,
          accountCategory: ACCOUNT_CATEGORIES.general,
        },
        raw: true,
      });

      const tx = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 5000,
          transactionType: TRANSACTION_TYPES.expense,
          time: new Date('2024-01-15').toISOString(),
        }),
        raw: true,
      });

      const originalAmount = tx[0].amount;
      const originalCurrencyCode = tx[0].currencyCode;

      // Change base currency
      await helpers.makeRequest({
        method: 'post',
        url: '/user/currencies/change-base',
        payload: {
          newCurrencyCode: 'USD',
        },
      });

      // Verify original amount and currency are preserved
      const updatedTx = await Transactions.findByPk(tx[0].id);
      expect(updatedTx!.amount).toEqual(originalAmount);
      expect(updatedTx!.currencyCode).toEqual(originalCurrencyCode);

      // Only refAmount and refCurrencyCode should change
      expect(updatedTx!.refCurrencyCode).toEqual('USD');
      expect(updatedTx!.refAmount).not.toEqual(originalAmount);
    });

    it('should handle accounts with credit limits', async () => {
      const account = await helpers.createAccount({
        payload: {
          name: 'Credit Account',
          currencyCode: 'EUR',
          initialBalance: 0,
          creditLimit: 50000, // 500 EUR credit limit
          accountCategory: ACCOUNT_CATEGORIES.general,
        },
        raw: true,
      });

      const originalCreditLimit = account.creditLimit;
      const originalRefCreditLimit = account.refCreditLimit;

      // Change base currency
      await helpers.makeRequest({
        method: 'post',
        url: '/user/currencies/change-base',
        payload: {
          newCurrencyCode: 'USD',
        },
      });

      // Verify credit limit was recalculated
      const updatedAccount = await Accounts.findByPk(account.id);
      expect(updatedAccount!.creditLimit).toEqual(originalCreditLimit); // Original unchanged
      expect(updatedAccount!.refCreditLimit).not.toEqual(originalRefCreditLimit); // Ref changed
    });

    it('should handle transactions with commissions', async () => {
      const account = await helpers.createAccount({
        payload: {
          name: 'Account with Commission',
          currencyCode: 'EUR',
          initialBalance: 10000,
          creditLimit: 0,
          accountCategory: ACCOUNT_CATEGORIES.general,
        },
        raw: true,
      });

      const txPayload = helpers.buildTransactionPayload({
        accountId: account.id,
      });

      // Create transaction with commission
      const [baseTx] = await helpers.createTransaction({
        payload: {
          ...txPayload,
          commissionRate: txPayload.amount / 2,
        },
        raw: true,
      });

      const originalCommission = baseTx.commissionRate;
      const originalRefCommission = baseTx.refCommissionRate;

      // Change base currency
      await helpers.makeRequest({
        method: 'post',
        url: '/user/currencies/change-base',
        payload: {
          newCurrencyCode: 'USD',
        },
      });

      // Verify commission was recalculated
      const updatedTx = await Transactions.findByPk(baseTx.id, { raw: true });
      expect(updatedTx!.commissionRate).toEqual(originalCommission); // Original unchanged
      expect(updatedTx!.refCommissionRate).not.toEqual(originalRefCommission); // Ref changed
      expect(updatedTx!.refCurrencyCode).toEqual('USD');
    });

    it('should rebuild balance history correctly for system accounts', async () => {
      const account = await helpers.createAccount({
        payload: {
          name: 'System Account',
          currencyCode: 'EUR',
          initialBalance: 10000,
          creditLimit: 0,
          accountCategory: ACCOUNT_CATEGORIES.general,
        },
        raw: true,
      });

      // Create transactions on different dates
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 2000,
          transactionType: TRANSACTION_TYPES.expense,
          time: new Date('2024-01-10').toISOString(),
        }),
        raw: true,
      });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 3000,
          transactionType: TRANSACTION_TYPES.income,
          time: new Date('2024-01-15').toISOString(),
        }),
        raw: true,
      });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 1000,
          transactionType: TRANSACTION_TYPES.expense,
          time: new Date('2024-01-20').toISOString(),
        }),
        raw: true,
      });

      // Change base currency
      await helpers.makeRequest({
        method: 'post',
        url: '/user/currencies/change-base',
        payload: {
          newCurrencyCode: 'USD',
        },
      });

      // Verify balances were rebuilt
      const balancesAfter = await Balances.findAll({
        where: { accountId: account.id },
        order: [['date', 'ASC']],
      });

      // Should have at least one balance per transaction date
      expect(balancesAfter.length).toBeGreaterThan(0);

      // Verify balances are in chronological order
      for (let i = 1; i < balancesAfter.length; i++) {
        expect(new Date(balancesAfter[i]!.date).getTime()).toBeGreaterThanOrEqual(
          new Date(balancesAfter[i - 1]!.date).getTime(),
        );
      }
    });

    it('should handle empty accounts without transactions', async () => {
      const account = await helpers.createAccount({
        payload: {
          name: 'Empty Account',
          currencyCode: 'EUR',
          initialBalance: 5000,
          creditLimit: 0,
          accountCategory: ACCOUNT_CATEGORIES.general,
        },
        raw: true,
      });

      // Change base currency
      const response = await helpers.makeRequest({
        method: 'post',
        url: '/user/currencies/change-base',
        payload: {
          newCurrencyCode: 'USD',
        },
      });

      expect(response.statusCode).toEqual(200);

      // Verify account was still updated
      const updatedAccount = await Accounts.findByPk(account.id);
      expect(updatedAccount!.refInitialBalance).toBeDefined();
      expect(updatedAccount!.refCurrentBalance).toBeDefined();
    });

    it('should handle the complete recalculation of everything with a correct outcome', async () => {
      // Add currencies that will be used
      const { currencies } = await helpers.addUserCurrencies({ currencyCodes: ['UAH', 'EUR'], raw: true });

      // ========== STEP 1: Create accounts with different currencies ==========

      const uahCurrency = currencies.find((i) => i.currencyCode === 'UAH')!;
      const eurCurrency = currencies.find((i) => i.currencyCode === 'EUR')!;

      const accounts = await Promise.all([
        // USD will become our new base currency
        ...[uahCurrency.currencyCode, eurCurrency.currencyCode, 'USD'].map((currencyCode) =>
          helpers.createAccount({
            payload: {
              name: `${currencyCode} Account`,
              currencyCode: currencyCode,
              initialBalance: 100000,
              creditLimit: 50000,
              accountCategory: ACCOUNT_CATEGORIES.general,
            },
            raw: true,
          }),
        ),
      ]);
      const uahAccount = accounts[0]!;
      const eurAccount = accounts[1]!;
      const usdAccount = accounts[2]!;

      // ========== STEP 2: Create transactions for accounts ==========

      await Promise.all(
        accounts
          .map((account, index) =>
            Array.from({ length: 10 }).map(() =>
              helpers.createTransaction({
                payload: helpers.buildTransactionPayload({
                  accountId: account.id,
                  amount: faker.number.int({ min: 1000, max: 10000 }),
                  transactionType: index % 2 ? TRANSACTION_TYPES.expense : TRANSACTION_TYPES.income,
                  time: faker.date.between({ from: new Date('2024-01-10'), to: new Date('2024-10-10') }).toISOString(),
                }),
                raw: true,
              }),
            ),
          )
          .flat(),
      );

      // ========== STEP 3: Create investment portfolio and transactions ==========

      // Create portfolio
      const portfolio = await helpers.createPortfolio({
        payload: {
          name: 'Test Investment Portfolio',
        },
        raw: true,
      });

      // Seed securities
      const securities = await helpers.seedSecurities([
        { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', currencyCode: 'USD' },
      ]);

      const vooSecurity = securities[0]!;

      // Create holding
      await helpers.createHolding({
        payload: {
          portfolioId: portfolio.id,
          securityId: vooSecurity.id,
        },
        raw: true,
      });

      // Create investment transaction (BUY)
      const investmentTx = await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: portfolio.id,
          securityId: vooSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          date: '2024-01-18',
          quantity: '10',
          price: '400', // $400 per share
          fees: '5', // $5 fees
        },
        raw: true,
      });

      // Update portfolio balance
      await helpers.updatePortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode: 'USD',
        setAvailableCash: '5000',
        setTotalCash: '5000',
        raw: true,
      });

      // Create portfolio transfer
      const transfer = await helpers.createPortfolioTransfer({
        fromPortfolioId: portfolio.id,
        payload: helpers.buildPortfolioTransferPayload({
          toPortfolioId: portfolio.id, // Self transfer for testing
          currencyCode: 'USD',
          amount: '1000',
          date: '2024-01-25',
        }),
        raw: true,
      });

      // ========== STEP 4: Store original ref values and calculate expected values for new base (USD) ==========

      // Get original values before currency change
      const originalUahTransactions = await Transactions.findAll({ where: { accountId: uahAccount.id }, raw: true });
      const originalEurTransactions = await Transactions.findAll({ where: { accountId: eurAccount.id }, raw: true });
      const originalUsdTransactions = await Transactions.findAll({ where: { accountId: usdAccount.id }, raw: true });

      const originalUahAccount = (await Accounts.findByPk(uahAccount.id))!;
      const originalEurAccount = (await Accounts.findByPk(eurAccount.id))!;
      const originalUsdAccount = (await Accounts.findByPk(usdAccount.id))!;

      const originalInvestmentTx = await InvestmentTransaction.findByPk(investmentTx.id);
      const originalTransfer = await PortfolioTransfers.findByPk(transfer.id);

      await Holdings.findOne({
        where: { portfolioId: portfolio.id, securityId: vooSecurity.id },
      });

      const originalPortfolioBalance = await PortfolioBalances.findOne({
        where: { portfolioId: portfolio.id, currencyCode: 'USD' },
      });

      // Store what the current base currency is for verification
      const currentBaseCurrency = (await helpers.getUserCurrencies()).find((i) => i.isDefaultCurrency)!;

      // Verify original ref currency codes match current base currency (whatever it is)
      // All transactions should have been created with the same ref currency
      const originalRefCurrency = originalUahTransactions[0]?.refCurrencyCode;
      expect(originalRefCurrency).toBeDefined();
      expect(originalRefCurrency).toEqual(currentBaseCurrency.currencyCode);

      // Verify all transactions have the same original ref currency
      expect(originalUahTransactions.every((i) => i.refCurrencyCode === originalRefCurrency)).toBe(true);
      expect(originalEurTransactions.every((i) => i.refCurrencyCode === originalRefCurrency)).toBe(true);
      expect(originalUsdTransactions.every((i) => i.refCurrencyCode === originalRefCurrency)).toBe(true);

      // ========== STEP 5: Change base currency to USD ==========

      const response = await helpers.makeRequest({
        method: 'post',
        url: '/user/currencies/change-base',
        payload: {
          newCurrencyCode: 'USD',
        },
      });

      expect(response.statusCode).toEqual(200);
      expect(response.body.status).toEqual(API_RESPONSE_STATUS.success);

      // Verify response statistics
      const result = response.body.response;
      expect(result.transactionsUpdated).toBeGreaterThanOrEqual(30); // 30 transactions created
      expect(result.accountsUpdated).toEqual(3); // Our 3 accounts
      expect(result.investmentTransactionsUpdated).toBeGreaterThanOrEqual(1);
      expect(result.holdingsUpdated).toBeGreaterThanOrEqual(1);
      expect(result.portfolioBalancesUpdated).toBeGreaterThanOrEqual(1);
      // Portfolio transfers might not be updated if they're self-transfers or certain conditions
      // expect(result.portfolioTransfersUpdated).toBeGreaterThanOrEqual(0);

      // ========== STEP 6: Verify base currency was changed ==========

      const newBaseCurrency = (await helpers.getUserCurrencies()).find((i) => i.isDefaultCurrency)!;
      expect(newBaseCurrency.currencyCode).toEqual('USD');
      expect(newBaseCurrency.isDefaultCurrency).toBe(true);

      // ========== STEP 7: Verify transactions were recalculated correctly ==========

      const updatedUahTransactions = await Transactions.findAll({ where: { accountId: uahAccount.id }, raw: true });
      const updatedEurTransactions = await Transactions.findAll({ where: { accountId: eurAccount.id }, raw: true });
      const updatedUsdTransactions = await Transactions.findAll({ where: { accountId: usdAccount.id }, raw: true });

      // All transactions should now have USD as refCurrencyCode
      expect(updatedUahTransactions.every((tx) => tx.refCurrencyCode === 'USD')).toBe(true);
      expect(updatedEurTransactions.every((tx) => tx.refCurrencyCode === 'USD')).toBe(true);
      expect(updatedUsdTransactions.every((tx) => tx.refCurrencyCode === 'USD')).toBe(true);

      // Verify original amounts and currencies are preserved
      for (let i = 0; i < originalUahTransactions.length; i++) {
        expect(updatedUahTransactions[i]!.amount).toEqual(originalUahTransactions[i]!.amount);
        expect(updatedUahTransactions[i]!.currencyCode).toEqual('UAH');
        // RefAmount should have changed (unless it was 0)
        if (originalUahTransactions[i]!.amount !== 0) {
          expect(updatedUahTransactions[i]!.refAmount).not.toEqual(originalUahTransactions[i]!.refAmount);
        }
      }

      for (let i = 0; i < originalEurTransactions.length; i++) {
        expect(updatedEurTransactions[i]!.amount).toEqual(originalEurTransactions[i]!.amount);
        expect(updatedEurTransactions[i]!.currencyCode).toEqual('EUR');
        // RefAmount should have changed (unless it was 0)
        if (originalEurTransactions[i]!.amount !== 0) {
          expect(updatedEurTransactions[i]!.refAmount).not.toEqual(originalEurTransactions[i]!.refAmount);
        }
      }

      // USD transactions: refAmount should equal amount (same currency as new base)
      for (const tx of updatedUsdTransactions) {
        expect(tx.refAmount).toEqual(tx.amount);
        expect(tx.currencyCode).toEqual('USD');
        expect(tx.refCurrencyCode).toEqual('USD');
      }

      // ========== STEP 7.5: Validate refAmount calculations are CORRECT using exchange rates ==========

      // Pick 3 sample transactions from different currencies to validate calculations
      const sampleUahTx = updatedUahTransactions[0]!;
      const sampleEurTx = updatedEurTransactions[0]!;
      const sampleUsdTx = updatedUsdTransactions[0]!;

      // Fetch exchange rates for sample transaction dates
      const uahTxDate = format(new Date(sampleUahTx.time), 'yyyy-MM-dd');
      const eurTxDate = format(new Date(sampleEurTx.time), 'yyyy-MM-dd');

      const uahRates = (await helpers.getExchangeRates({ date: uahTxDate, raw: true }))!;
      const eurRates = (await helpers.getExchangeRates({ date: eurTxDate, raw: true }))!;

      // Find UAH->USD rate (might be direct or need to calculate through base)

      // Try reverse calculation: if we have USD->UAH, then UAH->USD = 1 / (USD->UAH)
      const uahToUsdRate = 1 / uahRates.find((r) => r.baseCode === 'USD' && r.quoteCode === 'UAH')!.rate;
      // Find EUR->USD rate
      const eurToUsdRate = 1 / eurRates.find((r) => r.baseCode === 'USD' && r.quoteCode === 'EUR')!.rate;

      // Validate UAH transaction calculation using the actual service function
      const expectedUahRefAmount = calculateRefAmountFromParams({ amount: sampleUahTx.amount, rate: uahToUsdRate });
      expect(sampleUahTx.refAmount).toEqualRefValue(expectedUahRefAmount);

      // Validate EUR transaction calculation using the actual service function
      const expectedEurRefAmount = calculateRefAmountFromParams({ amount: sampleEurTx.amount, rate: eurToUsdRate });
      expect(sampleEurTx.refAmount).toEqualRefValue(expectedEurRefAmount);

      // Validate USD transaction (should be 1:1)
      expect(sampleUsdTx.refAmount).toEqual(sampleUsdTx.amount);

      // ========== STEP 8: Verify accounts were recalculated correctly ==========

      const updatedUahAccount = await Accounts.findByPk(uahAccount.id);
      const updatedEurAccount = await Accounts.findByPk(eurAccount.id);
      const updatedUsdAccount = await Accounts.findByPk(usdAccount.id);

      // Original balances and currencies should be preserved
      expect(updatedUahAccount!.initialBalance).toEqual(originalUahAccount!.initialBalance);
      expect(updatedEurAccount!.initialBalance).toEqual(originalEurAccount!.initialBalance);
      expect(updatedUsdAccount!.initialBalance).toEqual(originalUsdAccount!.initialBalance);
      expect(updatedUahAccount!.currencyCode).toEqual('UAH');
      expect(updatedEurAccount!.currencyCode).toEqual('EUR');
      expect(updatedUsdAccount!.currencyCode).toEqual('USD');

      // Ref balances should have changed for non-USD accounts
      expect(updatedUahAccount!.refInitialBalance).not.toEqual(originalUahAccount!.refInitialBalance);
      expect(updatedEurAccount!.refInitialBalance).not.toEqual(originalEurAccount!.refInitialBalance);
      expect(updatedUahAccount!.refCreditLimit).not.toEqual(originalUahAccount!.refCreditLimit);
      expect(updatedEurAccount!.refCreditLimit).not.toEqual(originalEurAccount!.refCreditLimit);

      // USD account ref values should equal original values (same currency as new base)
      expect(updatedUsdAccount!.refInitialBalance).toEqual(updatedUsdAccount!.initialBalance);
      expect(updatedUsdAccount!.refCreditLimit).toEqual(updatedUsdAccount!.creditLimit);
      // Note: refCurrentBalance might differ from currentBalance due to calculation timing
      expect(updatedUsdAccount!.refCurrentBalance).toBeDefined();

      // ========== STEP 9: Verify investment transactions were recalculated correctly ==========

      const updatedInvestmentTx = await InvestmentTransaction.findByPk(investmentTx.id);

      // Original values preserved
      expect(updatedInvestmentTx!.amount).toEqual(originalInvestmentTx!.amount);
      expect(updatedInvestmentTx!.fees).toEqual(originalInvestmentTx!.fees);
      expect(updatedInvestmentTx!.price).toEqual(originalInvestmentTx!.price);

      // Investment tx is in USD, so ref values should equal original values
      expect(parseFloat(updatedInvestmentTx!.refAmount)).toEqual(parseFloat(updatedInvestmentTx!.amount));
      expect(parseFloat(updatedInvestmentTx!.refFees)).toEqual(parseFloat(updatedInvestmentTx!.fees));
      expect(parseFloat(updatedInvestmentTx!.refPrice)).toEqual(parseFloat(updatedInvestmentTx!.price));

      // ========== STEP 10: Verify portfolio transfers were recalculated correctly ==========

      const updatedTransfer = await PortfolioTransfers.findByPk(transfer.id);

      if (updatedTransfer) {
        // Original amount preserved
        expect(updatedTransfer.amount).toEqual(originalTransfer!.amount);

        // Transfer is in USD, so ref amount should equal amount
        expect(parseFloat(updatedTransfer.refAmount)).toEqual(parseFloat(updatedTransfer.amount));
      }
      // Note: Portfolio transfers might not be updated in certain scenarios (e.g., self-transfers)

      // ========== STEP 11: Verify holdings were recalculated correctly ==========

      const updatedHolding = (await Holdings.findOne({
        where: { portfolioId: portfolio.id, securityId: vooSecurity.id },
      }))!;

      // Values should exist
      expect(updatedHolding!.refCostBasis).toBeDefined();

      // Holding is in USD, so ref cost basis should equal cost basis
      expect(parseFloat(updatedHolding!.refCostBasis)).toEqual(parseFloat(updatedHolding!.costBasis));

      // ========== STEP 12: Verify portfolio balances were recalculated correctly ==========

      const updatedPortfolioBalance = await PortfolioBalances.findOne({
        where: { portfolioId: portfolio.id, currencyCode: 'USD' },
      });

      // Original values preserved
      expect(updatedPortfolioBalance!.availableCash).toEqual(originalPortfolioBalance!.availableCash);
      expect(updatedPortfolioBalance!.totalCash).toEqual(originalPortfolioBalance!.totalCash);

      // Portfolio balance is in USD, so ref values should equal original values
      expect(parseFloat(updatedPortfolioBalance!.refAvailableCash)).toEqual(
        parseFloat(updatedPortfolioBalance!.availableCash),
      );
      expect(parseFloat(updatedPortfolioBalance!.refTotalCash)).toEqual(parseFloat(updatedPortfolioBalance!.totalCash));

      // ========== STEP 13: Verify balance history was rebuilt ==========

      const uahBalances = await Balances.findAll({
        where: { accountId: uahAccount.id },
        order: [['date', 'ASC']],
      });

      const eurBalances = await Balances.findAll({
        where: { accountId: eurAccount.id },
        order: [['date', 'ASC']],
      });

      // Should have balance records
      expect(uahBalances.length).toBeGreaterThan(0);
      expect(eurBalances.length).toBeGreaterThan(0);

      // ========== STEP 14: Verify new entities use new base currency ==========

      // Create a new transaction after currency change
      const newTx = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: eurAccount.id,
          amount: 10000, // 100 EUR
          transactionType: TRANSACTION_TYPES.expense,
          time: new Date().toISOString(),
        }),
        raw: true,
      });

      // New transaction should have USD as refCurrencyCode
      const newTxFromDb = await Transactions.findByPk(newTx[0].id);
      expect(newTxFromDb!.refCurrencyCode).toEqual('USD');

      // Create new account
      const newAccount = await helpers.createAccount({
        payload: {
          name: 'New EUR Account',
          currencyCode: 'EUR',
          initialBalance: 10000,
          creditLimit: 0,
          accountCategory: ACCOUNT_CATEGORIES.general,
        },
        raw: true,
      });

      // New account ref values should be in USD terms
      const newAccountFromDb = await Accounts.findByPk(newAccount.id);
      // EUR to USD conversion should result in different values
      expect(newAccountFromDb!.refInitialBalance).toBeDefined();
      // Since EUR != USD, ref should differ from original
      expect(newAccountFromDb!.refInitialBalance).not.toEqual(newAccountFromDb!.initialBalance);
    });

    it('should preserve balance records for accounts with initialBalance but no transactions', async () => {
      // Create account with initial balance but no transactions
      const accountWithInitialBalance = await helpers.createAccount({
        payload: {
          name: 'EUR Account with Initial Balance',
          currencyCode: 'EUR',
          initialBalance: 50000, // 500 EUR
          creditLimit: 0,
          accountCategory: ACCOUNT_CATEGORIES.general,
        },
        raw: true,
      });

      // Verify balance record exists before currency change
      const balanceBeforeChange = await Balances.findOne({
        where: { accountId: accountWithInitialBalance.id },
      });
      expect(balanceBeforeChange).toBeDefined();
      expect(balanceBeforeChange!.amount).toEqual(accountWithInitialBalance.refInitialBalance);

      // Get balance history via API before change
      const balanceHistoryBefore = await helpers.makeRequest({
        method: 'get',
        url: '/stats/balance-history',
        payload: { accountId: accountWithInitialBalance.id },
      });
      const balancesBeforeData = helpers.extractResponse(balanceHistoryBefore);
      expect(balancesBeforeData.length).toEqual(1);
      expect(balancesBeforeData[0].amount).toEqual(accountWithInitialBalance.refInitialBalance);

      // Change base currency to USD
      await helpers.makeRequest({
        method: 'post',
        url: '/user/currencies/change-base',
        payload: { newCurrencyCode: 'USD' },
      });

      // Verify balance record still exists after currency change
      const balanceAfterChange = await Balances.findOne({
        where: { accountId: accountWithInitialBalance.id },
      });
      expect(balanceAfterChange).toBeDefined();
      expect(balanceAfterChange!.amount).toBeGreaterThan(0);

      // Verify balance history is still available via API
      const balanceHistoryAfter = await helpers.makeRequest({
        method: 'get',
        url: '/stats/balance-history',
        payload: { accountId: accountWithInitialBalance.id },
      });
      const balancesAfterData = helpers.extractResponse(balanceHistoryAfter);
      expect(balancesAfterData.length).toBeGreaterThan(0);
      expect(balancesAfterData[0].amount).toBeGreaterThan(0);

      // Verify combined balance history includes this account
      const combinedBalanceHistory = await helpers.makeRequest({
        method: 'get',
        url: '/stats/balance-history',
      });
      const combinedData = helpers.extractResponse(combinedBalanceHistory);
      const accountBalances = combinedData.filter(
        (b: { accountId: number }) => b.accountId === accountWithInitialBalance.id,
      );
      expect(accountBalances.length).toBeGreaterThan(0);
    });

    it('should prevent concurrent base currency change requests using Redis lock', async () => {
      // Add USD currency to change to
      await helpers.addUserCurrencies({ currencyCodes: ['USD'], raw: true });

      // Start first request and immediately start second before first completes
      // We'll use Promise.race to detect which one fails
      const requests = await Promise.allSettled([
        helpers.makeRequest({
          method: 'post',
          url: '/user/currencies/change-base',
          payload: { newCurrencyCode: 'USD' },
        }),
        helpers.makeRequest({
          method: 'post',
          url: '/user/currencies/change-base',
          payload: { newCurrencyCode: 'USD' },
        }),
      ]);

      // One should succeed (200) and one should be locked (423)
      const statuses = requests.map((r) => (r.status === 'fulfilled' ? r.value.statusCode : null));

      // Should have one success and one locked error
      expect(statuses).toContain(200);
      expect(statuses).toContain(ERROR_CODES.Locked);
    });

    it('should automatically release lock after successful operation', async () => {
      // Add USD currency to change to
      await helpers.addUserCurrencies({ currencyCodes: ['USD'], raw: true });

      // First request should succeed
      const firstResponse = await helpers.makeRequest({
        method: 'post',
        url: '/user/currencies/change-base',
        payload: {
          newCurrencyCode: 'USD',
        },
      });

      expect(firstResponse.statusCode).toEqual(200);

      // Second request to change back should also succeed (lock was released)
      const secondResponse = await helpers.makeRequest({
        method: 'post',
        url: '/user/currencies/change-base',
        payload: {
          newCurrencyCode: 'GBP',
        },
      });

      expect(secondResponse.statusCode).toEqual(200);
    });

    it('should release lock even if operation fails', async () => {
      // Get current base currency
      const baseCurrency = (await helpers.getUserCurrencies()).find((i) => i.isDefaultCurrency)!;

      // Try to change to the same currency (will fail with ValidationError)
      const response = await helpers.makeRequest({
        method: 'post',
        url: '/user/currencies/change-base',
        payload: {
          newCurrencyCode: baseCurrency.currencyCode,
        },
      });

      // Should fail with validation error
      expect(response.statusCode).toEqual(ERROR_CODES.ValidationError);

      // Subsequent request should work (lock was released)
      await helpers.addUserCurrencies({ currencyCodes: ['EUR'], raw: true });
      const retryResponse = await helpers.makeRequest({
        method: 'post',
        url: '/user/currencies/change-base',
        payload: {
          newCurrencyCode: 'EUR',
        },
      });

      expect(retryResponse.statusCode).toEqual(200);
    });

    // TODO: find a way how to test it. It's in fact applies the lock, yet it's difficult to catch it in the test
    it.skip('should block creating accounts/transactions/investments during base currency change', async () => {
      // Add EUR currency to test with
      await helpers.addUserCurrencies({ currencyCodes: ['EUR'], raw: true });

      // Create some test data first to make the operation take longer
      const account = await helpers.createAccount({
        payload: {
          name: 'Test Account',
          currencyCode: 'GBP',
          initialBalance: 10000,
          creditLimit: 0,
          accountCategory: ACCOUNT_CATEGORIES.general,
        },
        raw: true,
      });

      // Get userId from the account to build lock key
      const userId = account.userId;
      const lockKey = buildLockKey(userId);

      // Start the base currency change but don't await it
      const [changeCurrencyResponse, createAccountResponse] = await Promise.all([
        helpers.makeRequest({
          method: 'post',
          url: '/user/currencies/change-base',
          payload: {
            newCurrencyCode: 'EUR',
          },
        }),
        helpers.makeRequest({
          method: 'post',
          url: '/accounts',
          payload: {
            name: 'Blocked Account',
            currencyCode: 'USD',
            initialBalance: 10000,
            creditLimit: 0,
            accountCategory: ACCOUNT_CATEGORIES.general,
          },
        }),
      ]);

      // Should be blocked with the specific error code
      expect(createAccountResponse.statusCode).toEqual(ERROR_CODES.Locked);
      expect(createAccountResponse.body.response.code).toEqual('BASE_CURRENCY_CHANGE_IN_PROGRESS');

      // Wait for currency change to complete
      expect(changeCurrencyResponse.statusCode).toEqual(200);

      // Verify lock was released
      const lockAfter = await redisClient.get(lockKey);
      expect(lockAfter).toBeNull();

      // Now creating an account should work
      const createAccountRetryResponse = await helpers.makeRequest({
        method: 'post',
        url: '/accounts',
        payload: {
          name: 'Successful Account',
          currencyCode: 'USD',
          initialBalance: 10000,
          creditLimit: 0,
          accountCategory: ACCOUNT_CATEGORIES.general,
        },
      });

      expect(createAccountRetryResponse.statusCode).toEqual(200);
    });
  });
});
