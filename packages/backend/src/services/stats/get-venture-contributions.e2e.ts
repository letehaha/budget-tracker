import { TRANSACTION_TYPES } from '@bt/shared/types';
import { VENTURE_CASH_FLOW_MODE, VENTURE_EVENT_TYPE } from '@bt/shared/types/venture';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

const FEB = { from: '2026-02-01', to: '2026-02-28' };

const investInDeal = async ({ name, amount, time }: { name: string; amount: number; time: string }) => {
  const account = await helpers.createAccount({ raw: true });
  const deal = await helpers.createVentureDeal({
    payload: {
      name,
      currencyCode: global.BASE_CURRENCY_CODE,
      principal: String(amount),
      entryFeePct: '0',
      investmentDate: time,
    },
    raw: true,
  });
  const [tx] = await helpers.createTransaction({
    payload: helpers.buildTransactionPayload({
      accountId: account.id,
      amount,
      transactionType: TRANSACTION_TYPES.expense,
      time: new Date(time).toISOString(),
    }),
    raw: true,
  });
  const event = await helpers.createVentureEvent({
    dealId: deal.id,
    payload: {
      type: VENTURE_EVENT_TYPE.initial_investment,
      eventDate: time,
      cashFlowMode: VENTURE_CASH_FLOW_MODE.linked,
      transactionIds: [tx!.id],
    },
  });
  expect(event.statusCode).toBe(200);
  return deal;
};

describe('GET /stats/venture-contributions', () => {
  it('sums linked venture transactions per deal, largest first', async () => {
    const small = await investInDeal({ name: 'Seed A', amount: 2000, time: '2026-02-04' });
    const large = await investInDeal({ name: 'Seed B', amount: 17360, time: '2026-02-10' });

    const result = await helpers.getVentureContributions({ ...FEB, raw: true });

    expect(result).toEqual([
      { dealId: large.id, name: 'Seed B', amount: 17360 },
      { dealId: small.id, name: 'Seed A', amount: 2000 },
    ]);
  });

  it('ignores deals funded outside the window', async () => {
    await investInDeal({ name: 'Old', amount: 5000, time: '2026-01-15' });

    const result = await helpers.getVentureContributions({ ...FEB, raw: true });

    expect(result).toEqual([]);
  });

  it('nets a linked income leg against the deal contribution', async () => {
    const deal = await investInDeal({ name: 'Seed C', amount: 10000, time: '2026-02-05' });
    const account = await helpers.createAccount({ raw: true });
    const [tx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 3000,
        transactionType: TRANSACTION_TYPES.income,
        time: new Date('2026-02-18').toISOString(),
      }),
      raw: true,
    });
    const event = await helpers.createVentureEvent({
      dealId: deal.id,
      payload: {
        type: VENTURE_EVENT_TYPE.distribution,
        eventDate: '2026-02-18',
        cashFlowMode: VENTURE_CASH_FLOW_MODE.linked,
        grossAmount: '3000',
        transactionIds: [tx!.id],
      },
    });
    expect(event.statusCode).toBe(200);

    const result = await helpers.getVentureContributions({ ...FEB, raw: true });

    expect(result).toEqual([{ dealId: deal.id, name: 'Seed C', amount: 7000 }]);
  });

  it('rejects a window whose end precedes its start', async () => {
    const response = await helpers.getVentureContributions({ from: FEB.to, to: FEB.from });

    expect(response.statusCode).toBe(422);
  });
});
