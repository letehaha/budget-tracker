import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { VENTURE_CASH_FLOW_MODE, VENTURE_DEAL_STATUS, VENTURE_EVENT_TYPE } from '@bt/shared/types/venture';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

/**
 * Lifecycle e2e — exercises the full PRD scenario 1 happy path + scenario 9
 * failure flows against the venture event endpoints. All txs, accounts, and
 * deals run in the user's base currency (global.BASE_CURRENCY.code) to avoid
 * FX-rate lookups during ref-amount restamp.
 */
describe('Venture Investment Lifecycle E2E', () => {
  describe('SK 116 happy path — PRD scenario 1', () => {
    it('runs the full deal lifecycle: initial → nav → distribution → exit', async () => {
      const baseCurrencyCode = global.BASE_CURRENCY.code;

      const platform = await helpers.createVenturePlatform({
        payload: {
          name: 'Acme Ventures',
          defaultEntryFeePct: '0.085',
          defaultCarryPct: '0.2',
          defaultHurdlePct: '0',
        },
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      const deal = await helpers.createVentureDeal({
        payload: {
          name: 'SK 116',
          platformId: platform.id,
          currencyCode: baseCurrencyCode,
          principal: '16000',
          investmentDate: '2026-03-24',
          carryPct: undefined,
          hurdlePct: undefined,
          entryFeePct: undefined,
          mgmtFeePct: undefined,
        },
        raw: true,
      });

      expect(Number(deal.principal)).toBe(16000);
      expect(Number(deal.entryFee)).toBeCloseTo(1360, 2);
      expect(deal.status).toBe(VENTURE_DEAL_STATUS.outstanding);

      const initialTx = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 17360,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const initialEventResponse = await helpers.createVentureEvent({
        dealId: deal.id,
        payload: {
          type: VENTURE_EVENT_TYPE.initial_investment,
          eventDate: '2026-03-24',
          cashFlowMode: VENTURE_CASH_FLOW_MODE.linked,
          transactionIds: [initialTx[0].id],
        },
      });
      expect(initialEventResponse.statusCode).toBe(200);

      const initialEvent = helpers.extractResponse(initialEventResponse);
      expect(initialEvent.type).toBe(VENTURE_EVENT_TYPE.initial_investment);
      expect(Number(initialEvent.lpNetAmount)).toBeCloseTo(17360, 2);
      expect(initialEvent.links).toHaveLength(1);

      const linkedTx = await helpers.getTransactions({ raw: true });
      const flipped = linkedTx.find((tx) => tx.id === initialTx[0].id)!;
      expect(flipped.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_venture);

      const navResponse = await helpers.createVentureEvent({
        dealId: deal.id,
        payload: {
          type: VENTURE_EVENT_TYPE.nav_update,
          eventDate: '2026-06-24',
          cashFlowMode: VENTURE_CASH_FLOW_MODE.none,
          navAfter: '18500',
        },
      });
      expect(navResponse.statusCode).toBe(200);

      const distTx = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 5000,
          transactionType: TRANSACTION_TYPES.income,
        }),
        raw: true,
      });

      const distResponse = await helpers.createVentureEvent({
        dealId: deal.id,
        payload: {
          type: VENTURE_EVENT_TYPE.distribution,
          eventDate: '2027-03-24',
          cashFlowMode: VENTURE_CASH_FLOW_MODE.linked,
          grossAmount: '5000',
          transactionIds: [distTx[0].id],
        },
      });
      expect(distResponse.statusCode).toBe(200);

      const dist = helpers.extractResponse(distResponse);
      expect(Number(dist.gpCarryAmount)).toBe(0); // all principal return
      expect(Number(dist.lpNetAmount)).toBe(5000);

      const dealAfterDist = await helpers.getVentureDeal({ dealId: deal.id, raw: true });
      expect(dealAfterDist.status).toBe(VENTURE_DEAL_STATUS.partial_exit);

      const exitTx = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 22472,
          transactionType: TRANSACTION_TYPES.income,
        }),
        raw: true,
      });

      const exitResponse = await helpers.createVentureEvent({
        dealId: deal.id,
        payload: {
          type: VENTURE_EVENT_TYPE.exit,
          eventDate: '2029-03-24',
          cashFlowMode: VENTURE_CASH_FLOW_MODE.linked,
          grossAmount: '25000',
          navAfter: '0',
          transactionIds: [exitTx[0].id],
        },
      });
      expect(exitResponse.statusCode).toBe(200);

      const exit = helpers.extractResponse(exitResponse);
      // costBasis=17360, cumulativeReturned=5000 → principalRemaining=12360
      // principalReturnedThisEvent=12360, profit=12640, carry=2528, lpNet=22472
      expect(Number(exit.gpCarryAmount)).toBeCloseTo(2528, 2);
      expect(Number(exit.lpNetAmount)).toBeCloseTo(22472, 2);

      const dealAfterExit = await helpers.getVentureDeal({ dealId: deal.id, raw: true });
      expect(dealAfterExit.status).toBe(VENTURE_DEAL_STATUS.fully_exited);
    });
  });

  describe('failure flows — PRD scenario 9', () => {
    it('rejects sum mismatch (tx sum ≠ event lpNet)', async () => {
      const account = await helpers.createAccount({ raw: true });
      const deal = await helpers.createVentureDeal({
        payload: { currencyCode: global.BASE_CURRENCY.code, principal: '10000', entryFeePct: '0' },
        raw: true,
      });

      const wrongAmountTx = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 5000,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const response = await helpers.createVentureEvent({
        dealId: deal.id,
        payload: {
          type: VENTURE_EVENT_TYPE.initial_investment,
          eventDate: '2026-03-24',
          cashFlowMode: VENTURE_CASH_FLOW_MODE.linked,
          transactionIds: [wrongAmountTx[0].id],
        },
      });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('rejects linking a tx already attached to a venture event', async () => {
      const account = await helpers.createAccount({ raw: true });
      const dealA = await helpers.createVentureDeal({
        payload: { currencyCode: global.BASE_CURRENCY.code, principal: '5000', entryFeePct: '0' },
        raw: true,
      });
      const dealB = await helpers.createVentureDeal({
        payload: { name: 'Other deal', currencyCode: global.BASE_CURRENCY.code, principal: '5000', entryFeePct: '0' },
        raw: true,
      });

      const tx = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 5000,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const ok = await helpers.createVentureEvent({
        dealId: dealA.id,
        payload: {
          type: VENTURE_EVENT_TYPE.initial_investment,
          eventDate: '2026-03-24',
          cashFlowMode: VENTURE_CASH_FLOW_MODE.linked,
          transactionIds: [tx[0].id],
        },
      });
      expect(ok.statusCode).toBe(200);

      const conflict = await helpers.createVentureEvent({
        dealId: dealB.id,
        payload: {
          type: VENTURE_EVENT_TYPE.initial_investment,
          eventDate: '2026-03-24',
          cashFlowMode: VENTURE_CASH_FLOW_MODE.linked,
          transactionIds: [tx[0].id],
        },
      });
      expect(conflict.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('rejects two initial_investment events on the same deal', async () => {
      const account = await helpers.createAccount({ raw: true });
      const deal = await helpers.createVentureDeal({
        payload: { currencyCode: global.BASE_CURRENCY.code, principal: '10000', entryFeePct: '0' },
        raw: true,
      });
      const tx1 = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 10000,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const first = await helpers.createVentureEvent({
        dealId: deal.id,
        payload: {
          type: VENTURE_EVENT_TYPE.initial_investment,
          eventDate: '2026-03-24',
          cashFlowMode: VENTURE_CASH_FLOW_MODE.linked,
          transactionIds: [tx1[0].id],
        },
      });
      expect(first.statusCode).toBe(200);

      const second = await helpers.createVentureEvent({
        dealId: deal.id,
        payload: {
          type: VENTURE_EVENT_TYPE.initial_investment,
          eventDate: '2026-04-01',
          cashFlowMode: VENTURE_CASH_FLOW_MODE.out_of_wallet,
        },
      });
      expect(second.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('writedown to zero → status=written_off', async () => {
      const deal = await helpers.createVentureDeal({
        payload: { currencyCode: global.BASE_CURRENCY.code, principal: '10000', entryFeePct: '0' },
        raw: true,
      });

      await helpers.createVentureEvent({
        dealId: deal.id,
        payload: {
          type: VENTURE_EVENT_TYPE.writedown,
          eventDate: '2027-01-01',
          cashFlowMode: VENTURE_CASH_FLOW_MODE.none,
          navAfter: '0',
        },
      });

      const reread = await helpers.getVentureDeal({ dealId: deal.id, raw: true });
      expect(reread.status).toBe(VENTURE_DEAL_STATUS.written_off);
    });

    it('out_of_wallet event → no link rows, no tx flip', async () => {
      const deal = await helpers.createVentureDeal({
        payload: { currencyCode: global.BASE_CURRENCY.code, principal: '10000', entryFeePct: '0' },
        raw: true,
      });

      const response = await helpers.createVentureEvent({
        dealId: deal.id,
        payload: {
          type: VENTURE_EVENT_TYPE.initial_investment,
          eventDate: '2026-03-24',
          cashFlowMode: VENTURE_CASH_FLOW_MODE.out_of_wallet,
        },
      });
      expect(response.statusCode).toBe(200);

      const event = helpers.extractResponse(response);
      expect(event.cashFlowMode).toBe(VENTURE_CASH_FLOW_MODE.out_of_wallet);
      expect(event.links).toEqual([]);
    });

    it('nav_update rejects cashFlowMode != none', async () => {
      const deal = await helpers.createVentureDeal({
        payload: { currencyCode: global.BASE_CURRENCY.code, principal: '10000', entryFeePct: '0' },
        raw: true,
      });

      const response = await helpers.createVentureEvent({
        dealId: deal.id,
        payload: {
          type: VENTURE_EVENT_TYPE.nav_update,
          eventDate: '2027-01-01',
          cashFlowMode: VENTURE_CASH_FLOW_MODE.linked,
          navAfter: '5000',
        },
      });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });

  describe('initial_investment creation paths', () => {
    it('happy path: linked tx sum equals principal + entryFee → 200, lpNet matches', async () => {
      const baseCurrencyCode = global.BASE_CURRENCY.code;
      const account = await helpers.createAccount({ raw: true });
      const deal = await helpers.createVentureDeal({
        payload: { currencyCode: baseCurrencyCode, principal: '11000', entryFeePct: '0.085' },
        raw: true,
      });
      // 11000 + 935 = 11935
      expect(Number(deal.principal)).toBe(11000);
      expect(Number(deal.entryFee)).toBeCloseTo(935, 2);

      const tx = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 11935,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const response = await helpers.createVentureEvent({
        dealId: deal.id,
        payload: {
          type: VENTURE_EVENT_TYPE.initial_investment,
          eventDate: '2026-03-24',
          cashFlowMode: VENTURE_CASH_FLOW_MODE.linked,
          transactionIds: [tx[0].id],
        },
      });
      expect(response.statusCode).toBe(200);

      const event = helpers.extractResponse(response);
      expect(event.type).toBe(VENTURE_EVENT_TYPE.initial_investment);
      expect(Number(event.lpNetAmount)).toBeCloseTo(11935, 2);
      expect(event.cashFlowMode).toBe(VENTURE_CASH_FLOW_MODE.linked);
      expect(event.links).toHaveLength(1);
    });

    it('happy path: out_of_wallet initial_investment → 200, no links', async () => {
      const deal = await helpers.createVentureDeal({
        payload: { currencyCode: global.BASE_CURRENCY.code, principal: '5000', entryFeePct: '0.05' },
        raw: true,
      });

      const response = await helpers.createVentureEvent({
        dealId: deal.id,
        payload: {
          type: VENTURE_EVENT_TYPE.initial_investment,
          eventDate: '2026-03-24',
          cashFlowMode: VENTURE_CASH_FLOW_MODE.out_of_wallet,
        },
      });
      expect(response.statusCode).toBe(200);

      const event = helpers.extractResponse(response);
      expect(Number(event.lpNetAmount)).toBeCloseTo(5250, 2); // 5000 + 5%
      expect(event.cashFlowMode).toBe(VENTURE_CASH_FLOW_MODE.out_of_wallet);
      expect(event.links).toEqual([]);
    });

    it('rejects principal=0 deal with a clear error message (no confusing "0.00" mismatch)', async () => {
      const deal = await helpers.createVentureDeal({
        payload: { currencyCode: global.BASE_CURRENCY.code, principal: '0', entryFeePct: '0' },
        raw: true,
      });

      const response = await helpers.createVentureEvent({
        dealId: deal.id,
        payload: {
          type: VENTURE_EVENT_TYPE.initial_investment,
          eventDate: '2026-03-24',
          cashFlowMode: VENTURE_CASH_FLOW_MODE.out_of_wallet,
        },
      });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      // Error must point at the actual fix (set principal on the deal), not at the
      // sum-mismatch downstream symptom.
      expect((response.body.response as unknown as helpers.ErrorResponse).message).toMatch(/principal/i);
      expect((response.body.response as unknown as helpers.ErrorResponse).message).not.toMatch(/sum of linked/i);
    });

    it('rejects principal=0 even when caller supplies a linked tx', async () => {
      const account = await helpers.createAccount({ raw: true });
      const deal = await helpers.createVentureDeal({
        payload: { currencyCode: global.BASE_CURRENCY.code, principal: '0', entryFeePct: '0' },
        raw: true,
      });
      const tx = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 1000,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const response = await helpers.createVentureEvent({
        dealId: deal.id,
        payload: {
          type: VENTURE_EVENT_TYPE.initial_investment,
          eventDate: '2026-03-24',
          cashFlowMode: VENTURE_CASH_FLOW_MODE.linked,
          transactionIds: [tx[0].id],
        },
      });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      expect((response.body.response as unknown as helpers.ErrorResponse).message).toMatch(/principal/i);
    });
  });

  describe('carry override + reset', () => {
    it('lpNetAmount + gpCarry override is preserved on create', async () => {
      const account = await helpers.createAccount({ raw: true });
      const deal = await helpers.createVentureDeal({
        payload: {
          currencyCode: global.BASE_CURRENCY.code,
          principal: '10000',
          entryFeePct: '0',
          carryPct: '0.2',
          hurdlePct: '0',
        },
        raw: true,
      });

      await helpers.createVentureEvent({
        dealId: deal.id,
        payload: {
          type: VENTURE_EVENT_TYPE.initial_investment,
          eventDate: '2026-03-24',
          cashFlowMode: VENTURE_CASH_FLOW_MODE.out_of_wallet,
        },
      });

      const distTx = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 15000,
          transactionType: TRANSACTION_TYPES.income,
        }),
        raw: true,
      });

      const distResponse = await helpers.createVentureEvent({
        dealId: deal.id,
        payload: {
          type: VENTURE_EVENT_TYPE.distribution,
          eventDate: '2027-03-24',
          cashFlowMode: VENTURE_CASH_FLOW_MODE.linked,
          grossAmount: '20000',
          gpCarryOverride: '5000',
          lpNetAmountOverride: '15000',
          transactionIds: [distTx[0].id],
        },
      });
      expect(distResponse.statusCode).toBe(200);

      const dist = helpers.extractResponse(distResponse);
      expect(Number(dist.gpCarryAmount)).toBe(5000);
      expect(Number(dist.lpNetAmount)).toBe(15000);
      expect(dist.gpCarryOverridden).toBe(true);
      expect(dist.lpNetAmountOverridden).toBe(true);
    });
  });
});
