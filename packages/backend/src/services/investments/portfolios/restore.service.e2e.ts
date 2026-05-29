import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';
import { describe, expect, it } from 'vitest';

describe('Restore Portfolio Service E2E', () => {
  describe('POST /investments/portfolios/:id/restore', () => {
    it('should restore a soft-deleted portfolio and bring it back into the list', async () => {
      const created = await helpers.createPortfolio({ raw: true });
      await helpers.deletePortfolio({ portfolioId: created.id });

      const response = await helpers.restorePortfolio({ portfolioId: created.id });
      expect(response.statusCode).toBe(200);

      const list = await helpers.listPortfolios({ raw: true });
      expect(list.data.find((p) => p.id === created.id)).toBeDefined();

      const trash = await helpers.listPortfolios({ onlyDeleted: true, raw: true });
      expect(trash.data.find((p) => p.id === created.id)).toBeUndefined();
    });

    it('should return 404 when the portfolio does not exist', async () => {
      const response = await helpers.restorePortfolio({ portfolioId: generateRandomRecordId() });
      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('should return ValidationError when the portfolio is not in trash', async () => {
      const created = await helpers.createPortfolio({ raw: true });

      const response = await helpers.restorePortfolio({ portfolioId: created.id });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });
});
