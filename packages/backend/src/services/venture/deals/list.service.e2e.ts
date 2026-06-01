import { VENTURE_DEAL_STATUS } from '@bt/shared/types/venture';
import * as helpers from '@tests/helpers';

describe('List Venture Deals Service E2E', () => {
  describe('GET /venture/deals', () => {
    it('returns empty list when no deals', async () => {
      const response = await helpers.listVentureDeals({});
      expect(response.statusCode).toBe(200);

      const body = helpers.extractResponse(response);
      expect(body.data).toEqual([]);
      expect(body.pagination).toMatchObject({ limit: 20, offset: 0, page: 1 });
    });

    it('returns deals ordered by investmentDate DESC', async () => {
      await helpers.createVentureDeal({ payload: { name: 'A', investmentDate: '2024-01-01' } });
      await helpers.createVentureDeal({ payload: { name: 'B', investmentDate: '2026-06-01' } });
      await helpers.createVentureDeal({ payload: { name: 'C', investmentDate: '2025-03-15' } });

      const body = await helpers.listVentureDeals({ raw: true });
      expect(body.data.map((d) => d.name)).toEqual(['B', 'C', 'A']);
    });

    it('filters by status', async () => {
      const d1 = await helpers.createVentureDeal({ payload: { name: 'Active' }, raw: true });
      await helpers.createVentureDeal({ payload: { name: 'Exited' }, raw: true });
      const d2Detail = await helpers.updateVentureDeal({
        dealId: (await helpers.createVentureDeal({ payload: { name: 'Closed' }, raw: true })).id,
        payload: { status: VENTURE_DEAL_STATUS.fully_exited },
        raw: true,
      });

      const onlyOutstanding = await helpers.listVentureDeals({
        status: VENTURE_DEAL_STATUS.outstanding,
        raw: true,
      });
      expect(onlyOutstanding.data.find((d) => d.id === d1.id)).toBeDefined();
      expect(onlyOutstanding.data.find((d) => d.id === d2Detail.id)).toBeUndefined();
    });

    it('filters by platformId', async () => {
      const platform = await helpers.createVenturePlatform({ payload: { name: 'Filter Pf' }, raw: true });

      await helpers.createVentureDeal({ payload: { name: 'On platform', platformId: platform.id }, raw: true });
      await helpers.createVentureDeal({ payload: { name: 'No platform' }, raw: true });

      const onPlatform = await helpers.listVentureDeals({ platformId: platform.id, raw: true });
      expect(onPlatform.data).toHaveLength(1);
      expect(onPlatform.data[0]!.name).toBe('On platform');
    });
  });
});
