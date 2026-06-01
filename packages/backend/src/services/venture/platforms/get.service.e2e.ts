import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Get Venture Platform Service E2E', () => {
  describe('GET /venture/platforms/:id', () => {
    it('returns platform for owner', async () => {
      const created = await helpers.createVenturePlatform({
        payload: { name: 'Owned VC' },
        raw: true,
      });

      const response = await helpers.getVenturePlatform({ platformId: created.id });
      expect(response.statusCode).toBe(200);

      const platform = helpers.extractResponse(response);
      expect(platform.id).toBe(created.id);
      expect(platform.name).toBe('Owned VC');
    });

    it('returns 404 for nonexistent id', async () => {
      const response = await helpers.getVenturePlatform({ platformId: generateRandomRecordId() });
      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('rejects malformed id', async () => {
      const response = await helpers.getVenturePlatform({ platformId: 'not-a-uuid' });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });
});
