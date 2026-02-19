/**
 * E2E tests for MoneyColumn getter/setter integration with Sequelize.
 *
 * Verifies that Money conversion works correctly across different
 * Sequelize query patterns: normal queries, raw: true, aggregates,
 * literal updates, and direct model operations.
 */
import { BUDGET_TYPES, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import Accounts from '@models/Accounts.model';
import Balances from '@models/Balances.model';
import Transactions from '@models/Transactions.model';
import * as helpers from '@tests/helpers';

import { Money } from './money';

describe('MoneyColumn integration', () => {
  describe('Transactions model (INTEGER cents storage)', () => {
    it('findOne returns Money objects via getters', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 500 }),
        raw: true,
      });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 25.5,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const tx = await Transactions.findOne({
        where: { accountId: account.id },
      });

      expect(tx).not.toBeNull();
      // Getter should return Money objects
      expect(Money.isMoney(tx!.amount)).toBe(true);
      expect(Money.isMoney(tx!.refAmount)).toBe(true);
      expect(Money.isMoney(tx!.commissionRate)).toBe(true);
      expect(Money.isMoney(tx!.refCommissionRate)).toBe(true);
      expect(Money.isMoney(tx!.cashbackAmount)).toBe(true);

      // Values should be correct decimals (not cents)
      expect(tx!.amount.toNumber()).toBe(25.5);
      expect(tx!.commissionRate.toNumber()).toBe(0);
    });

    it('findOne with raw: true returns plain cents numbers (no getters)', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 500 }),
        raw: true,
      });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 25.5,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const tx = await Transactions.findOne({
        where: { accountId: account.id },
        raw: true,
      });

      expect(tx).not.toBeNull();
      // raw: true bypasses getters, returns plain DB values (cents)
      expect(Money.isMoney(tx!.amount)).toBe(false);
      expect(typeof tx!.amount).toBe('number');
      expect(tx!.amount as unknown as number).toBe(2550); // 25.50 * 100 = 2550 cents
      expect(tx!.commissionRate as unknown as number).toBe(0);
    });

    it('create accepts Money objects via setters', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 500 }),
        raw: true,
      });

      // Create directly via model with Money objects
      const tx = await Transactions.create({
        amount: Money.fromDecimal(42.99),
        refAmount: Money.fromDecimal(42.99),
        commissionRate: Money.zero(),
        refCommissionRate: Money.zero(),
        cashbackAmount: Money.zero(),
        accountId: account.id,
        userId: global.APP_USER_ID,
        transactionType: TRANSACTION_TYPES.expense,
        paymentType: 'creditCard',
        transferNature: 'not_transfer',
        time: new Date(),
        categoryId: 1,
        currencyCode: global.BASE_CURRENCY.code,
        accountType: 'system',
        refCurrencyCode: null,
      });

      // Re-read to verify stored correctly
      const raw = await Transactions.findByPk(tx.id, { raw: true });
      expect(raw!.amount as unknown as number).toBe(4299); // stored as cents
      expect(raw!.refAmount as unknown as number).toBe(4299);
      expect(raw!.commissionRate as unknown as number).toBe(0);

      // Normal read returns Money
      const normal = await Transactions.findByPk(tx.id);
      expect(normal!.amount.toNumber()).toBe(42.99);
    });

    it('update with save() works with Money', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 500 }),
        raw: true,
      });

      const [baseTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 10,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const tx = await Transactions.findByPk(baseTx.id);
      tx!.amount = Money.fromDecimal(20.5);
      await tx!.save();

      // Verify via raw query
      const raw = await Transactions.findByPk(baseTx.id, { raw: true });
      expect(raw!.amount as unknown as number).toBe(2050);
    });
  });

  describe('Balances model (INTEGER cents storage)', () => {
    it('findOne returns Money for amount field', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 100 }),
        raw: true,
      });

      const balance = await Balances.findOne({
        where: { accountId: account.id },
      });

      expect(balance).not.toBeNull();
      expect(Money.isMoney(balance!.amount)).toBe(true);
      // initialBalance = 100 decimal → refInitialBalance in base currency
      expect(balance!.amount.toNumber()).toBe(100);
    });

    it('Model.update with literal does not crash getters', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 100 }),
        raw: true,
      });

      // This is the pattern that previously crashed — Sequelize internally
      // builds a temp instance, triggers setter then getter on the Literal.
      await expect(
        Balances.update({ amount: Balances.sequelize!.literal('amount + 5000') }, { where: { accountId: account.id } }),
      ).resolves.not.toThrow();

      // Verify the update worked (100 * 100 cents + 5000 cents = 15000 cents = 150 decimal)
      const balance = await Balances.findOne({
        where: { accountId: account.id },
      });
      expect(balance!.amount.toNumber()).toBe(150);
    });

    it('Model.update with negative literal works correctly', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 200 }),
        raw: true,
      });

      await Balances.update(
        { amount: Balances.sequelize!.literal('amount - 5000') },
        { where: { accountId: account.id } },
      );

      const balance = await Balances.findOne({
        where: { accountId: account.id },
      });
      // 200 * 100 cents - 5000 cents = 15000 cents = 150 decimal
      expect(balance!.amount.toNumber()).toBe(150);
    });

    it('Model.update with Money.toCents() in literal (real cascade pattern)', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 300 }),
        raw: true,
      });

      // This is the exact pattern used in Balances.updateBalanceIncremental()
      const incrementAmount = Money.fromDecimal(25.5);
      await Balances.update(
        { amount: Balances.sequelize!.literal(`amount + ${incrementAmount.toCents()}`) },
        { where: { accountId: account.id } },
      );

      const balance = await Balances.findOne({
        where: { accountId: account.id },
      });
      expect(balance!.amount.toNumber()).toBe(325.5);
    });

    it('Model.update with negated Money.toCents() in literal', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 300 }),
        raw: true,
      });

      // Pattern: amount.negate().toCents() for reversing a transaction
      const amount = Money.fromDecimal(50);
      await Balances.update(
        { amount: Balances.sequelize!.literal(`amount + ${amount.negate().toCents()}`) },
        { where: { accountId: account.id } },
      );

      const balance = await Balances.findOne({
        where: { accountId: account.id },
      });
      expect(balance!.amount.toNumber()).toBe(250);
    });

    it('sequential literal updates accumulate correctly', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 100 }),
        raw: true,
      });

      // Simulate multiple transactions affecting the same balance record
      await Balances.update(
        { amount: Balances.sequelize!.literal('amount + 1000') },
        { where: { accountId: account.id } },
      );
      await Balances.update(
        { amount: Balances.sequelize!.literal('amount + 2000') },
        { where: { accountId: account.id } },
      );
      await Balances.update(
        { amount: Balances.sequelize!.literal('amount - 500') },
        { where: { accountId: account.id } },
      );

      const balance = await Balances.findOne({
        where: { accountId: account.id },
      });
      // 10000 + 1000 + 2000 - 500 = 12500 cents = 125 decimal
      expect(balance!.amount.toNumber()).toBe(125);
    });

    it('aggregate sum returns raw number (not Money)', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 200 }),
        raw: true,
      });

      const result = await Balances.sum('amount', {
        where: { accountId: account.id },
      });

      // Sequelize aggregates return raw DB values
      expect(typeof result).toBe('number');
      expect(result).toBe(20000); // 200 * 100 = 20000 cents
    });
  });

  describe('Accounts model (INTEGER cents storage)', () => {
    it('findOne returns Money for all money fields', async () => {
      const created = await helpers.createAccount({
        payload: helpers.buildAccountPayload({
          initialBalance: 250.75,
          creditLimit: 1000,
        }),
        raw: true,
      });

      const account = await Accounts.findByPk(created.id);

      expect(account).not.toBeNull();
      expect(Money.isMoney(account!.initialBalance)).toBe(true);
      expect(Money.isMoney(account!.currentBalance)).toBe(true);
      expect(Money.isMoney(account!.creditLimit)).toBe(true);
      expect(Money.isMoney(account!.refInitialBalance)).toBe(true);
      expect(Money.isMoney(account!.refCurrentBalance)).toBe(true);
      expect(Money.isMoney(account!.refCreditLimit)).toBe(true);

      expect(account!.initialBalance.toNumber()).toBe(250.75);
      expect(account!.creditLimit.toNumber()).toBe(1000);
    });

    it('raw: true returns plain cents for money fields', async () => {
      const created = await helpers.createAccount({
        payload: helpers.buildAccountPayload({
          initialBalance: 250.75,
          creditLimit: 1000,
        }),
        raw: true,
      });

      const account = await Accounts.findByPk(created.id, { raw: true });

      expect(typeof (account!.initialBalance as unknown)).toBe('number');
      expect(account!.initialBalance as unknown as number).toBe(25075); // 250.75 * 100
      expect(account!.creditLimit as unknown as number).toBe(100000); // 1000 * 100
    });
  });

  describe('JSON serialization (toJSON)', () => {
    it('Money fields auto-serialize to numbers via toJSON', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 42.5 }),
        raw: true,
      });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 15.25,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const tx = await Transactions.findOne({
        where: { accountId: account.id },
      });

      // Simulate what res.json() does
      const json = JSON.parse(JSON.stringify(tx!.toJSON()));

      expect(typeof json.amount).toBe('number');
      expect(json.amount).toBe(15.25);
      expect(typeof json.commissionRate).toBe('number');
      expect(json.commissionRate).toBe(0);
    });
  });

  describe('API response serialization', () => {
    it('GET /transactions returns decimal amounts (not cents)', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 500 }),
        raw: true,
      });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 33.33,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const response = await helpers.getTransactions({ raw: true });

      expect(response.length).toBeGreaterThan(0);
      const tx = response.find((t) => t.accountId === account.id);
      expect(tx).toBeDefined();
      expect(tx!.amount).toBe(33.33);
    });

    it('POST /transactions returns decimal amounts in response', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 500 }),
        raw: true,
      });

      const [baseTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 77.77,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      expect(baseTx.amount).toBe(77.77);
      expect(baseTx.commissionRate).toBe(0);
      expect(baseTx.cashbackAmount).toBe(0);
    });
  });

  describe('Bug regressions', () => {
    it('budget stats: category budget stats returns correct decimal amounts', async () => {
      // Bug: getCategoryBudgetStats() accumulated tx.refAmount.toNumber() (decimals)
      // but serializeBudgetStats.toApiDecimal() treated plain numbers as cents.
      // Result: 150 cents → .toNumber() = 1.5 → fromCents(1.5) = 0.015 (100x too small)
      //
      // Fix: getCategoryBudgetStats() should use .toCents() to keep raw cents,
      // consistent with getManualBudgetStats() which uses raw: true.
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 500 }),
        raw: true,
      });

      const budget = await helpers.createCustomBudget({
        name: 'test-budget',
        categoryIds: [1],
        limitAmount: 1000,
        type: BUDGET_TYPES.category,
        raw: true,
      });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 1.5,
          categoryId: 1,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const stats = await helpers.getStats({ id: budget.id, raw: true });

      // Must be 1.5 (decimal), NOT 0.015 (double-converted)
      expect(stats!.summary.actualExpense).toBeCloseTo(1.5, 2);
    });

    it('tag reminders: amountThreshold stored in JSONB must survive roundtrip', async () => {
      // Bug: deserializer converted amountThreshold to Money, service stored Money
      // in JSONB (serialized via toJSON() → decimal). Serializer read it back as cents
      // via Money.fromCents(decimal), causing 100x error.
      //
      // Fix: deserializer should convert to cents (plain number) for JSONB storage.
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload(),
        raw: true,
      });

      const reminder = await helpers.createTagReminder({
        tagId: tag.id,
        payload: {
          type: 'amount_threshold',
          settings: { amountThreshold: 1500 },
        },
        raw: true,
      });

      // API should return the same decimal value that was sent
      expect(reminder.settings.amountThreshold).toBe(1500);
    });

    it('instance.save() correctly persists Money via setter (not getter)', async () => {
      // Bug: Model.update() triggers getter during SQL generation, which returns
      // a Money object that Sequelize can't serialize to INTEGER. Using instance.save()
      // avoids this because save() reads from dataValues directly.
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 500 }),
        raw: true,
      });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 25,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const tx = await Transactions.findOne({ where: { accountId: account.id } });
      if (!tx) throw new Error('Transaction not found');

      // Simulate what change-base-currency does: set Money on instance, then save
      const newRefAmount = Money.fromDecimal(55.17);
      tx.refAmount = newRefAmount;
      await tx.save({ hooks: false });

      // Verify via raw query
      const raw = await Transactions.findByPk(tx.id, { raw: true });
      expect(raw!.refAmount as unknown as number).toBe(5517); // 55.17 * 100 = 5517 cents
    });

    it('GET /accounts returns array of serialized accounts', async () => {
      // Verify accounts endpoint returns proper array (not undefined or error)
      await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 100 }),
        raw: true,
      });

      const res = await helpers.makeRequest({ method: 'get', url: '/accounts' });
      expect(res.statusCode).toBe(200);

      const accounts = helpers.extractResponse(res);
      expect(Array.isArray(accounts)).toBe(true);
      expect(accounts.length).toBeGreaterThan(0);
    });
  });
});
