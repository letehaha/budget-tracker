import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

import { getResponseInitialState } from './stats';

describe('Get budget stats', () => {
  it('successfully returns stats', async () => {
    const [baseTx] = await helpers.createTransaction({ raw: true });
    const [base2Tx] = await helpers.createTransaction({ raw: true });

    // Budget *without* limitAmount
    const budget_1 = await helpers.createCustomBudget({
      name: 'test-1',
      startDate: '2025-03-01T00:00:00Z',
      endDate: '2025-03-04T23:59:59Z',
      raw: true,
    });

    // Budget *with* limitAmount
    const budget_2 = await helpers.createCustomBudget({
      name: 'test-2',
      startDate: '2025-03-01T00:00:00Z',
      endDate: '2025-03-04T23:59:59Z',
      limitAmount: 1500,
      raw: true,
    });

    // Empty budget
    const budget_3 = await helpers.createCustomBudget({
      name: 'test-3',
      startDate: '2025-03-01T00:00:00Z',
      endDate: '2025-03-04T23:59:59Z',
      raw: true,
    });

    const data = {
      transactionIds: [baseTx.id, base2Tx.id],
    };

    await helpers.addTransactionToCustomBudget({
      id: budget_1.id,
      payload: data,
    });
    await helpers.addTransactionToCustomBudget({
      id: budget_2.id,
      payload: data,
    });

    const budget_1_result = (await helpers.getStats({ id: budget_1.id, raw: true }))!;
    const budget_2_result = (await helpers.getStats({ id: budget_2.id, raw: true }))!;
    const budget_3_result = (await helpers.getStats({ id: budget_3.id, raw: true }))!;

    expect(budget_1_result.summary.actualExpense).toBe(2000);
    expect(budget_2_result.summary.actualExpense).toBe(2000);

    expect(budget_1_result.summary.actualIncome).toBe(0);
    expect(budget_2_result.summary.actualIncome).toBe(0);

    expect(budget_1_result.summary.balance).toBe(-2000);

    expect(budget_1_result.summary.utilizationRate).toBe(null);
    expect(budget_2_result.summary.utilizationRate?.toFixed(2)).toBe(((2000 / 1500) * 100).toFixed(2));

    expect(budget_3_result).toEqual(getResponseInitialState());
  });

  it('fails when invalid param provided', async () => {
    expect((await helpers.getStats({ id: 'foo' as unknown as number, raw: false })).statusCode).toBe(
      ERROR_CODES.ValidationError,
    );

    expect((await helpers.getStats({ id: 100500, raw: false })).statusCode).toBe(ERROR_CODES.NotFoundError);
  });
});
