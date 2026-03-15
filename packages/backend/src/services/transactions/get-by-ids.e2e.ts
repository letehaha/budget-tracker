import { API_RESPONSE_STATUS } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

describe('GET /transactions/by-ids', () => {
  it('should return transactions by their IDs', async () => {
    const account = await helpers.createAccount({ raw: true });

    const [tx1] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 100 }),
      raw: true,
    });
    const [tx2] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 200 }),
      raw: true,
    });

    const result = await helpers.getTransactionsByIds({
      ids: [tx1.id, tx2.id],
      raw: true,
    });

    expect(result).toHaveLength(2);

    const returnedIds = result.map((t) => t.id).toSorted();
    expect(returnedIds).toEqual([tx1.id, tx2.id].toSorted());

    // Verify amounts are serialized to decimals
    const firstTx = result.find((t) => t.id === tx1.id)!;
    expect(firstTx.amount).toBe(100);
    const secondTx = result.find((t) => t.id === tx2.id)!;
    expect(secondTx.amount).toBe(200);
  });

  it('should return empty array when no IDs match', async () => {
    const result = await helpers.getTransactionsByIds({
      ids: [999999],
      raw: true,
    });

    expect(result).toEqual([]);
  });

  it('should only return transactions matching the requested IDs', async () => {
    const account = await helpers.createAccount({ raw: true });

    const [tx1] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId: account.id }),
      raw: true,
    });
    // Create a second transaction that should NOT be returned
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId: account.id }),
      raw: true,
    });

    const result = await helpers.getTransactionsByIds({
      ids: [tx1.id],
      raw: true,
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(tx1.id);
  });

  it('should return 422 when ids contain non-numeric values', async () => {
    const res = await helpers.makeRequest({
      method: 'get',
      url: '/transactions/by-ids',
      payload: { ids: 'abc,def' },
    });

    expect(res.statusCode).toBe(422);
    expect(res.body.status).toBe(API_RESPONSE_STATUS.error);
  });

  it('should return 422 when ids query param is missing', async () => {
    const res = await helpers.makeRequest({
      method: 'get',
      url: '/transactions/by-ids',
    });

    expect(res.statusCode).toBe(422);
    expect(res.body.status).toBe(API_RESPONSE_STATUS.error);
  });
});
