import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Delete Venture Deal Service E2E', () => {
  describe('DELETE /venture/deals/:id', () => {
    it('soft-deletes a deal', async () => {
      const created = await helpers.createVentureDeal({ payload: { name: 'Trash' }, raw: true });

      const response = await helpers.deleteVentureDeal({ dealId: created.id });
      expect(response.statusCode).toBe(200);

      const get = await helpers.getVentureDeal({ dealId: created.id });
      expect(get.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('hard-deletes when force=true', async () => {
      const created = await helpers.createVentureDeal({ raw: true });

      const response = await helpers.deleteVentureDeal({ dealId: created.id, force: true });
      expect(response.statusCode).toBe(200);

      const get = await helpers.getVentureDeal({ dealId: created.id });
      expect(get.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('is idempotent on nonexistent id', async () => {
      const response = await helpers.deleteVentureDeal({ dealId: generateRandomRecordId() });
      expect(response.statusCode).toBe(200);
    });

    it('rejects malformed id', async () => {
      const response = await helpers.deleteVentureDeal({ dealId: 'not-a-uuid' });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });
});
