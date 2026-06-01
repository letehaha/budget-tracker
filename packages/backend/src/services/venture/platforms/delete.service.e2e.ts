import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Delete Venture Platform Service E2E', () => {
  describe('DELETE /venture/platforms/:id', () => {
    it('soft-deletes a platform', async () => {
      const created = await helpers.createVenturePlatform({
        payload: { name: 'Trash Me' },
        raw: true,
      });

      const deleteResponse = await helpers.deleteVenturePlatform({ platformId: created.id });
      expect(deleteResponse.statusCode).toBe(200);

      // Subsequent GET should 404 (paranoid hides soft-deleted)
      const getResponse = await helpers.getVenturePlatform({ platformId: created.id });
      expect(getResponse.statusCode).toBe(ERROR_CODES.NotFoundError);

      // List should not include it
      const list = await helpers.listVenturePlatforms({ raw: true });
      expect(list.data.find((p) => p.id === created.id)).toBeUndefined();
    });

    it('hard-deletes when force=true', async () => {
      const created = await helpers.createVenturePlatform({
        payload: { name: 'Force Delete' },
        raw: true,
      });

      const response = await helpers.deleteVenturePlatform({
        platformId: created.id,
        force: true,
      });
      expect(response.statusCode).toBe(200);

      const getResponse = await helpers.getVenturePlatform({ platformId: created.id });
      expect(getResponse.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('is idempotent on nonexistent id', async () => {
      const response = await helpers.deleteVenturePlatform({
        platformId: generateRandomRecordId(),
      });
      expect(response.statusCode).toBe(200);
    });

    it('rejects malformed id', async () => {
      const response = await helpers.deleteVenturePlatform({ platformId: 'not-a-uuid' });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('allows reusing soft-deleted platform name on new create', async () => {
      const created = await helpers.createVenturePlatform({
        payload: { name: 'Reusable Name' },
        raw: true,
      });

      await helpers.deleteVenturePlatform({ platformId: created.id });

      const reused = await helpers.createVenturePlatform({
        payload: { name: 'Reusable Name' },
      });
      expect(reused.statusCode).toBe(200);
    });
  });
});
