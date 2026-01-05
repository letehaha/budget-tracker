import { TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Create transaction with splits', () => {
  it('should create transaction with a single split', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();
    const primaryCategory = categories[0]!;
    const splitCategory = categories[1]!;

    const txPayload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: primaryCategory.id,
      amount: 1000,
      splits: [{ categoryId: splitCategory.id, amount: 400 }],
    });

    const response = await helpers.createTransaction({
      payload: txPayload,
      raw: false,
    });

    expect(response.statusCode).toBe(200);

    // Fetch transaction with splits included
    const transactions = await helpers.getTransactions({
      raw: true,
      includeSplits: true,
    });

    expect(transactions).toHaveLength(1);
    const txWithSplits = transactions![0]!;

    expect(txWithSplits.splits).toHaveLength(1);
    expect(txWithSplits.splits![0]!.categoryId).toBe(splitCategory.id);
    expect(txWithSplits.splits![0]!.amount).toBe(400);
  });

  it('should create transaction with multiple splits', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();
    const primaryCategory = categories[0]!;
    const splitCategory1 = categories[1]!;
    const splitCategory2 = categories[2]!;

    const txPayload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: primaryCategory.id,
      amount: 1000,
      splits: [
        { categoryId: splitCategory1.id, amount: 300 },
        { categoryId: splitCategory2.id, amount: 200 },
      ],
    });

    const response = await helpers.createTransaction({
      payload: txPayload,
      raw: false,
    });

    expect(response.statusCode).toBe(200);

    const transactions = await helpers.getTransactions({
      raw: true,
      includeSplits: true,
    });

    expect(transactions).toHaveLength(1);
    const txWithSplits = transactions![0]!;

    expect(txWithSplits.splits).toHaveLength(2);
    expect(txWithSplits.splits!.map((s) => s.amount).sort()).toEqual([200, 300]);
  });

  it('should create transaction with splits having notes', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();

    const txPayload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: categories[0]!.id,
      amount: 1000,
      splits: [{ categoryId: categories[1]!.id, amount: 400, note: 'Test split note' }],
    });

    const response = await helpers.createTransaction({
      payload: txPayload,
      raw: false,
    });

    expect(response.statusCode).toBe(200);

    const transactions = await helpers.getTransactions({
      raw: true,
      includeSplits: true,
    });

    expect(transactions![0]!.splits![0]!.note).toBe('Test split note');
  });

  it('should reject splits on transfer transactions', async () => {
    const accountA = await helpers.createAccount({ raw: true });
    const accountB = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();

    const txPayload = {
      ...helpers.buildTransactionPayload({
        accountId: accountA.id,
        categoryId: categories[0]!.id,
        amount: 1000,
      }),
      transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
      destinationAmount: 1000,
      destinationAccountId: accountB.id,
      splits: [{ categoryId: categories[1]!.id, amount: 400 }],
    };

    const res = await helpers.createTransaction({
      payload: txPayload,
      raw: false,
    });

    expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('should reject when total split amount exceeds transaction amount', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();

    const txPayload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: categories[0]!.id,
      amount: 1000,
      splits: [
        { categoryId: categories[1]!.id, amount: 600 },
        { categoryId: categories[2]!.id, amount: 600 }, // Total 1200 > 1000
      ],
    });

    const res = await helpers.createTransaction({
      payload: txPayload,
      raw: false,
    });

    expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('should reject split with amount less than minimum (0.01)', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();

    const txPayload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: categories[0]!.id,
      amount: 1000,
      splits: [{ categoryId: categories[1]!.id, amount: 0 }], // Amount 0 < minimum
    });

    const res = await helpers.createTransaction({
      payload: txPayload,
      raw: false,
    });

    expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('should reject more than 10 splits', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();

    // Create 11 splits with small amounts
    const splits = Array.from({ length: 11 }, (_, i) => ({
      categoryId: categories[i % categories.length]!.id,
      amount: 10,
    }));

    const txPayload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: categories[0]!.id,
      amount: 1000,
      splits,
    });

    const res = await helpers.createTransaction({
      payload: txPayload,
      raw: false,
    });

    expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('should reject split with non-existent category', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();

    const txPayload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: categories[0]!.id,
      amount: 1000,
      splits: [{ categoryId: 999999, amount: 400 }], // Non-existent category
    });

    const res = await helpers.createTransaction({
      payload: txPayload,
      raw: false,
    });

    expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('should reject split with note exceeding 100 characters', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();

    const longNote = 'a'.repeat(101);

    const txPayload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: categories[0]!.id,
      amount: 1000,
      splits: [{ categoryId: categories[1]!.id, amount: 400, note: longNote }],
    });

    const res = await helpers.createTransaction({
      payload: txPayload,
      raw: false,
    });

    expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('should allow primary category to receive remaining amount after splits', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();
    const primaryCategory = categories[0]!;

    // Transaction of 1000, split takes 400, primary should have 600
    const txPayload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: primaryCategory.id,
      amount: 1000,
      splits: [{ categoryId: categories[1]!.id, amount: 400 }],
    });

    const response = await helpers.createTransaction({
      payload: txPayload,
      raw: false,
    });

    expect(response.statusCode).toBe(200);

    const transactions = await helpers.getTransactions({
      raw: true,
      includeSplits: true,
    });

    const txWithSplits = transactions![0]!;

    // The transaction amount is still 1000
    expect(txWithSplits.amount).toBe(1000);
    // The split is 400
    expect(txWithSplits.splits![0]!.amount).toBe(400);
    // Primary category gets the remaining (1000 - 400 = 600)
  });

  it('should calculate refAmount for splits in different currency', async () => {
    // Create account with non-default currency
    await helpers.addUserCurrencies({ currencyCodes: ['UAH'] });

    const account = await helpers.createAccount({
      payload: {
        ...helpers.buildAccountPayload(),
        currencyCode: 'UAH',
      },
      raw: true,
    });

    const categories = await helpers.getCategoriesList();

    const txPayload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: categories[0]!.id,
      amount: 1000,
      splits: [{ categoryId: categories[1]!.id, amount: 400 }],
    });

    const response = await helpers.createTransaction({
      payload: txPayload,
      raw: false,
    });

    expect(response.statusCode).toBe(200);

    const transactions = await helpers.getTransactions({
      raw: true,
      includeSplits: true,
    });

    const txWithSplits = transactions![0]!;
    const currencyRate = (await helpers.getCurrenciesRates()).find((c) => c.baseCode === 'UAH');

    // Split should have refAmount calculated
    expect(txWithSplits.splits![0]!.refAmount).toEqualRefValue(400 * currencyRate!.rate);
  });
});
