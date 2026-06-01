import { VENTURE_DEAL_STATUS } from '@bt/shared/types/venture';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Update Venture Deal Service E2E', () => {
  describe('PUT /venture/deals/:id', () => {
    it('updates basic fields', async () => {
      const created = await helpers.createVentureDeal({ payload: { name: 'Old' }, raw: true });

      const updated = await helpers.updateVentureDeal({
        dealId: created.id,
        payload: { name: 'New', notes: 'Updated notes' },
        raw: true,
      });

      expect(updated.name).toBe('New');
      expect(updated.notes).toBe('Updated notes');
    });

    it('allows user-overridden status', async () => {
      const created = await helpers.createVentureDeal({ raw: true });

      const updated = await helpers.updateVentureDeal({
        dealId: created.id,
        payload: { status: VENTURE_DEAL_STATUS.partial_exit },
        raw: true,
      });

      expect(updated.status).toBe(VENTURE_DEAL_STATUS.partial_exit);
    });

    it('updates principal — historical entryFee snapshot not touched', async () => {
      const created = await helpers.createVentureDeal({
        payload: { principal: '10000', entryFee: '850' },
        raw: true,
      });

      const updated = await helpers.updateVentureDeal({
        dealId: created.id,
        payload: { principal: '20000' },
        raw: true,
      });

      expect(Number(updated.principal)).toBe(20000);
      expect(Number(updated.entryFee)).toBe(850);
    });

    it('switches platform association', async () => {
      const p1 = await helpers.createVenturePlatform({ payload: { name: 'Pf1' }, raw: true });
      const p2 = await helpers.createVenturePlatform({ payload: { name: 'Pf2' }, raw: true });

      const deal = await helpers.createVentureDeal({ payload: { platformId: p1.id }, raw: true });

      const updated = await helpers.updateVentureDeal({
        dealId: deal.id,
        payload: { platformId: p2.id },
        raw: true,
      });

      expect(updated.platformId).toBe(p2.id);
    });

    it('clears platform link when platformId = null', async () => {
      const p = await helpers.createVenturePlatform({ raw: true });
      const deal = await helpers.createVentureDeal({ payload: { platformId: p.id }, raw: true });

      const updated = await helpers.updateVentureDeal({
        dealId: deal.id,
        payload: { platformId: null },
        raw: true,
      });

      expect(updated.platformId).toBeNull();
    });

    it('rejects negative principal', async () => {
      const deal = await helpers.createVentureDeal({ raw: true });
      const response = await helpers.updateVentureDeal({
        dealId: deal.id,
        payload: { principal: '-1' },
      });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('returns 404 for nonexistent deal', async () => {
      const response = await helpers.updateVentureDeal({
        dealId: generateRandomRecordId(),
        payload: { name: 'X' },
      });
      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('rejects empty body', async () => {
      const deal = await helpers.createVentureDeal({ raw: true });
      const response = await helpers.updateVentureDeal({ dealId: deal.id, payload: {} });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });
});
