import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Get Portfolio Balance Service E2E', () => {
  describe('GET /investments/portfolios/:id/balance', () => {
    it('should return portfolio balances', async () => {
      const createResponse = await helpers.createPortfolio({
        payload: {
          name: 'Test Portfolio',
          portfolioType: PORTFOLIO_TYPE.investment,
          description: 'Test portfolio description',
        },
      });

      const createdPortfolio = helpers.extractResponse(createResponse);

      const balances = await helpers.getPortfolioBalance({
        portfolioId: createdPortfolio.id,
        raw: true,
      });

      expect(Array.isArray(balances)).toBe(true);
    });

    it('should return 404 when portfolio does not exist', async () => {
      const response = await helpers.getPortfolioBalance({
        portfolioId: 99999,
      });

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('should handle currencyCode query parameter', async () => {
      const createResponse = await helpers.createPortfolio({
        payload: {
          name: 'Test Portfolio',
          portfolioType: PORTFOLIO_TYPE.investment,
        },
      });

      const createdPortfolio = helpers.extractResponse(createResponse);

      const balances = await helpers.getPortfolioBalance({
        portfolioId: createdPortfolio.id,
        currencyCode: 'USD',
        raw: true,
      });

      expect(balances).toEqual([]);
    });
  });
});
