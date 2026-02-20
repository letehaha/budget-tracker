import { CATEGORY_TYPES, TRANSACTION_TYPES, asDecimal } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Balance Adjustment', () => {
  it('creates income transaction when target > current balance', async () => {
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
      raw: true,
    });

    const result = await helpers.balanceAdjustment({
      id: account.id,
      payload: { targetBalance: asDecimal(1500) },
      raw: true,
    });

    expect(result.previousBalance).toBe(1000);
    expect(result.newBalance).toBe(1500);
    expect(result.transaction).not.toBeNull();
    expect(result.transaction!.transactionType).toBe(TRANSACTION_TYPES.income);
    expect(result.transaction!.amount).toBe(500);

    const updatedAccount = await helpers.getAccount({ id: account.id, raw: true });
    expect(updatedAccount.currentBalance).toBe(1500);
  });

  it('creates expense transaction when target < current balance', async () => {
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 2000 }),
      raw: true,
    });

    const result = await helpers.balanceAdjustment({
      id: account.id,
      payload: { targetBalance: asDecimal(800) },
      raw: true,
    });

    expect(result.previousBalance).toBe(2000);
    expect(result.newBalance).toBe(800);
    expect(result.transaction).not.toBeNull();
    expect(result.transaction!.transactionType).toBe(TRANSACTION_TYPES.expense);
    expect(result.transaction!.amount).toBe(1200);

    const updatedAccount = await helpers.getAccount({ id: account.id, raw: true });
    expect(updatedAccount.currentBalance).toBe(800);
  });

  it('returns no transaction when target equals current balance', async () => {
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 500 }),
      raw: true,
    });

    const result = await helpers.balanceAdjustment({
      id: account.id,
      payload: { targetBalance: asDecimal(500) },
      raw: true,
    });

    expect(result.previousBalance).toBe(500);
    expect(result.newBalance).toBe(500);
    expect(result.transaction).toBeNull();

    const updatedAccount = await helpers.getAccount({ id: account.id, raw: true });
    expect(updatedAccount.currentBalance).toBe(500);
  });

  it('returns 404 when account does not belong to user', async () => {
    const res = await helpers.balanceAdjustment({
      id: 999999,
      payload: { targetBalance: asDecimal(100) },
    });

    expect(res.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('includes optional note in the created transaction', async () => {
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 0 }),
      raw: true,
    });

    const customNote = 'Reconciliation with bank statement';

    const result = await helpers.balanceAdjustment({
      id: account.id,
      payload: { targetBalance: asDecimal(300), note: customNote },
      raw: true,
    });

    expect(result.transaction).not.toBeNull();
    expect(result.transaction!.note).toBe(customNote);
  });

  it('assigns the "Other" (internal) category to the created transaction', async () => {
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 0 }),
      raw: true,
    });

    const result = await helpers.balanceAdjustment({
      id: account.id,
      payload: { targetBalance: asDecimal(200) },
      raw: true,
    });

    expect(result.transaction).not.toBeNull();

    const categories = await helpers.getCategoriesList();
    const otherCategory = categories.find((c) => c.type === CATEGORY_TYPES.internal);
    expect(otherCategory).toBeDefined();
    expect(result.transaction!.categoryId).toBe(otherCategory!.id);
  });

  it('handles non-default currency correctly', async () => {
    const { account } = await helpers.createAccountWithNewCurrency({ currency: 'UAH' });

    const result = await helpers.balanceAdjustment({
      id: account.id,
      payload: { targetBalance: asDecimal(5000) },
      raw: true,
    });

    expect(result.transaction).not.toBeNull();
    expect(result.newBalance).toBe(5000);

    const updatedAccount = await helpers.getAccount({ id: account.id, raw: true });
    expect(updatedAccount.currentBalance).toBe(5000);
  });
});
