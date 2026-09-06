import { VENTURE_CASH_FLOW_MODE, VENTURE_EVENT_TYPE } from '@bt/shared/types/venture';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Get Deal Metrics E2E', () => {
  describe('GET /venture/deals/:id/metrics', () => {
    it('returns zero metrics for a brand-new deal with no events', async () => {
      const deal = await helpers.createVentureDeal({
        payload: { currencyCode: global.BASE_CURRENCY.code, principal: '10000', entryFeePct: '0' },
        raw: true,
      });

      const metrics = await helpers.getVentureDealMetrics({ dealId: deal.id, raw: true });

      expect(Number(metrics.costBasis)).toBe(10000);
      expect(Number(metrics.totalDistributions)).toBe(0);
      expect(Number(metrics.currentValue)).toBe(10000); // default = costBasis - cumDist
      expect(Number(metrics.pnlAbsolute)).toBe(0);
      expect(Number(metrics.tvpi)).toBe(1);
      expect(Number(metrics.dpi)).toBe(0);
    });

    it('open-deal IRR uses currentValue as residual NAV', async () => {
      const deal = await helpers.createVentureDeal({
        payload: { currencyCode: global.BASE_CURRENCY.code, principal: '10000', entryFeePct: '0' },
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
      await helpers.createVentureEvent({
        dealId: deal.id,
        payload: {
          type: VENTURE_EVENT_TYPE.nav_update,
          eventDate: '2027-03-24',
          cashFlowMode: VENTURE_CASH_FLOW_MODE.none,
          navAfter: '15000',
        },
      });

      const metrics = await helpers.getVentureDealMetrics({ dealId: deal.id, raw: true });

      expect(Number(metrics.currentValue)).toBe(15000);
      expect(Number(metrics.tvpi)).toBeCloseTo(15000 / 10000, 3);
      expect(Number(metrics.dpi)).toBe(0);
      // IRR exists (paper return)
      expect(metrics.irr).not.toBeNull();
    });

    it('returns 404 for unknown deal', async () => {
      const response = await helpers.getVentureDealMetrics({
        dealId: '00000000-0000-0000-0000-000000000000',
      });
      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });
});
