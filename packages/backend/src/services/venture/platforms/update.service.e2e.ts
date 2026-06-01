import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Update Venture Platform Service E2E', () => {
  describe('PUT /venture/platforms/:id', () => {
    it('updates name + fees', async () => {
      const created = await helpers.createVenturePlatform({
        payload: { name: 'Old Name', defaultCarryPct: '0.2' },
        raw: true,
      });

      const updated = await helpers.updateVenturePlatform({
        platformId: created.id,
        payload: { name: 'New Name', defaultCarryPct: '0.25' },
        raw: true,
      });

      expect(updated.name).toBe('New Name');
      expect(Number(updated.defaultCarryPct)).toBe(0.25);
    });

    it('clears nullable fields when set to null', async () => {
      const created = await helpers.createVenturePlatform({
        payload: { website: 'https://x.io', description: 'foo' },
        raw: true,
      });

      const updated = await helpers.updateVenturePlatform({
        platformId: created.id,
        payload: { website: null, description: null },
        raw: true,
      });

      expect(updated.website).toBeNull();
      expect(updated.description).toBeNull();
    });

    it('returns 404 for nonexistent id', async () => {
      const response = await helpers.updateVenturePlatform({
        platformId: generateRandomRecordId(),
        payload: { name: 'Anything' },
      });
      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('rejects empty body', async () => {
      const created = await helpers.createVenturePlatform({ raw: true });

      const response = await helpers.updateVenturePlatform({
        platformId: created.id,
        payload: {},
      });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('rejects rename to a name owned by another platform', async () => {
      await helpers.createVenturePlatform({ payload: { name: 'Existing' } });
      const second = await helpers.createVenturePlatform({
        payload: { name: 'Different' },
        raw: true,
      });

      const response = await helpers.updateVenturePlatform({
        platformId: second.id,
        payload: { name: 'Existing' },
      });
      expect(response.statusCode).toBe(ERROR_CODES.ConflictError);
    });

    it('allows rename to current name (no-op)', async () => {
      const created = await helpers.createVenturePlatform({
        payload: { name: 'Same Name' },
        raw: true,
      });

      const response = await helpers.updateVenturePlatform({
        platformId: created.id,
        payload: { name: 'Same Name' },
      });
      expect(response.statusCode).toBe(200);
    });
  });
});
