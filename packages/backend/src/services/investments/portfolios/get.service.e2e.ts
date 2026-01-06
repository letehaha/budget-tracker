import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Get Portfolio Service E2E', () => {
  describe('GET /investments/portfolios/:id', () => {
    it('should return portfolio when valid ID is provided', async () => {
      const createResponse = await helpers.createPortfolio({
        payload: {
          name: 'Test Portfolio',
          portfolioType: PORTFOLIO_TYPE.investment,
          description: 'Test portfolio description',
        },
      });

      const createdPortfolio = helpers.extractResponse(createResponse);

      const response = await helpers.getPortfolio({
        portfolioId: createdPortfolio.id,
      });

      expect(response.statusCode).toBe(200);
      const result = helpers.extractResponse(response);
      expect(result).toMatchObject({
        id: createdPortfolio.id,
        name: 'Test Portfolio',
        portfolioType: PORTFOLIO_TYPE.investment,
        description: 'Test portfolio description',
        isEnabled: true,
      });
    });

    it('should return 404 when portfolio does not exist', async () => {
      const response = await helpers.getPortfolio({
        portfolioId: 99999,
      });

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });
});
