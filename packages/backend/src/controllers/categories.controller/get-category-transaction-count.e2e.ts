import { CategoryModel, type RecordId } from '@bt/shared/types';
import { NONEXISTENT_ID } from '@common/lib/record-id-helpers';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';
import { addDays } from 'date-fns';

const FUTURE_TIME = () => addDays(new Date(), 5).toISOString();

describe('GET /categories/:id/transaction-count', () => {
  let category: CategoryModel;
  let accountId: RecordId;

  beforeEach(async () => {
    category = await helpers.addCustomCategory({ name: 'Groceries', color: '#00FF00', raw: true });
    accountId = (await helpers.createAccount({ raw: true })).id;
  });

  const createReal = ({ amount }: { amount: number }) =>
    helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId, categoryId: category.id, amount }),
      raw: true,
    });

  const createPlanned = ({ amount }: { amount: number }) =>
    helpers.createPlannedTransaction({
      payload: { accountId, categoryId: category.id, amount, time: FUTURE_TIME() },
      raw: true,
    });

  it('returns zero for an empty or unknown category, and rejects a malformed id', async () => {
    expect(await helpers.getCategoryTransactionCount({ categoryId: category.id, raw: true })).toEqual({
      transactionCount: 0,
    });

    expect(await helpers.getCategoryTransactionCount({ categoryId: NONEXISTENT_ID, raw: true })).toEqual({
      transactionCount: 0,
    });

    const malformed = await helpers.getCategoryTransactionCount({ categoryId: 'not-a-uuid' });

    expect(malformed.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('counts real and planned transactions', async () => {
    await createReal({ amount: 100 });
    await createReal({ amount: 200 });
    await createPlanned({ amount: 300 });

    expect(await helpers.getCategoryTransactionCount({ categoryId: category.id, raw: true })).toEqual({
      transactionCount: 3,
    });
  });

  it('reports a plans-only category as reassignable, and the delete re-points the plan', async () => {
    const [planned] = await createPlanned({ amount: 100 });
    const replacement = await helpers.addCustomCategory({ name: 'Household', color: '#0000FF', raw: true });

    expect(await helpers.getCategoryTransactionCount({ categoryId: category.id, raw: true })).toEqual({
      transactionCount: 1,
    });

    const response = await helpers.deleteCustomCategory({
      categoryId: category.id,
      replaceWithCategoryId: replacement.id,
      raw: false,
    });

    expect(response.statusCode).toBe(200);
    expect((await helpers.getTransactionById({ id: planned.id, raw: true }))!.categoryId).toBe(replacement.id);
    expect((await helpers.getCategoriesList()).find((c) => c.id === category.id)).toBeUndefined();
  });

  it('stops counting a planned transaction once it is deleted', async () => {
    const [real] = await createReal({ amount: 100 });
    const [planned] = await createPlanned({ amount: 200 });

    await helpers.deleteTransaction({ id: planned.id });

    expect(await helpers.getCategoryTransactionCount({ categoryId: category.id, raw: true })).toEqual({
      transactionCount: 1,
    });
    expect((await helpers.getTransactionById({ id: real.id, raw: true }))!.id).toBe(real.id);
  });
});
