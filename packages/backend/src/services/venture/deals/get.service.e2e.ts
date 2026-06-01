import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Get Venture Deal Service E2E', () => {
  describe('GET /venture/deals/:id', () => {
    it('returns deal w/ platform + currency joins', async () => {
      const platform = await helpers.createVenturePlatform({ payload: { name: 'P1' }, raw: true });
      const created = await helpers.createVentureDeal({
        payload: { name: 'Detail Deal', platformId: platform.id },
        raw: true,
      });

      const response = await helpers.getVentureDeal({ dealId: created.id });
      expect(response.statusCode).toBe(200);

      const deal = helpers.extractResponse(response);
      expect(deal.id).toBe(created.id);
      expect(deal.platform).toMatchObject({ id: platform.id, name: 'P1' });
      expect(deal.currency).toMatchObject({ code: 'USD' });
    });

    it('returns 404 for nonexistent id', async () => {
      const response = await helpers.getVentureDeal({ dealId: generateRandomRecordId() });
      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('rejects malformed id', async () => {
      const response = await helpers.getVentureDeal({ dealId: 'not-a-uuid' });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });
});
