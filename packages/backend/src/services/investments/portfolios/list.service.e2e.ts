import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('List Portfolios Service E2E', () => {
  describe('GET /investments/portfolios', () => {
    it('should return empty array when user has no portfolios', async () => {
      const response = await helpers.listPortfolios();

      expect(response.statusCode).toBe(200);
      const result = helpers.extractResponse(response);
      expect(result.data).toEqual([]);
      expect(result.pagination).toMatchObject({
        limit: 20,
        offset: 0,
        page: 1,
      });
    });

    it('should list user portfolios with default pagination', async () => {
      // Create test portfolios
      await helpers.createPortfolio({
        payload: { name: 'Portfolio 1', portfolioType: PORTFOLIO_TYPE.investment },
      });
      await helpers.createPortfolio({
        payload: { name: 'Portfolio 2', portfolioType: PORTFOLIO_TYPE.investment },
      });

      const response = await helpers.listPortfolios();

      expect(response.statusCode).toBe(200);
      const result = helpers.extractResponse(response);
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toMatchObject({
        name: 'Portfolio 2', // Most recent first (createdAt DESC)
        portfolioType: PORTFOLIO_TYPE.investment,
        isEnabled: true,
      });
      expect(result.data[1]).toMatchObject({
        name: 'Portfolio 1',
        portfolioType: PORTFOLIO_TYPE.investment,
        isEnabled: true,
      });
      expect(result.pagination).toMatchObject({
        limit: 20,
        offset: 0,
        page: 1,
      });
    });

    it('should filter portfolios by portfolioType and by isEnabled', async () => {
      await helpers.createPortfolio({
        payload: { name: 'Investment Portfolio', portfolioType: PORTFOLIO_TYPE.investment },
      });
      await helpers.createPortfolio({
        payload: { name: 'Retirement Portfolio', portfolioType: PORTFOLIO_TYPE.retirement },
      });
      await helpers.createPortfolio({
        payload: { name: 'Disabled Portfolio', portfolioType: PORTFOLIO_TYPE.savings, isEnabled: false },
      });

      const byType = await helpers.listPortfolios({ portfolioType: PORTFOLIO_TYPE.investment });

      expect(byType.statusCode).toBe(200);
      const byTypeResult = helpers.extractResponse(byType);
      expect(byTypeResult.data).toHaveLength(1);
      expect(byTypeResult.data[0]).toMatchObject({
        name: 'Investment Portfolio',
        portfolioType: PORTFOLIO_TYPE.investment,
      });

      const byEnabled = await helpers.listPortfolios({ isEnabled: false });

      expect(byEnabled.statusCode).toBe(200);
      const byEnabledResult = helpers.extractResponse(byEnabled);
      expect(byEnabledResult.data).toHaveLength(1);
      expect(byEnabledResult.data[0]).toMatchObject({
        name: 'Disabled Portfolio',
        isEnabled: false,
      });
    }, 30000);

    it('should support pagination with limit and offset, and with the page parameter', async () => {
      for (let i = 1; i <= 5; i++) {
        await helpers.createPortfolio({
          payload: { name: `Portfolio ${i}` },
        });
      }

      const offsetResponse = await helpers.listPortfolios({ limit: 2, offset: 2 });

      expect(offsetResponse.statusCode).toBe(200);
      const offsetResult = helpers.extractResponse(offsetResponse);
      expect(offsetResult.data).toHaveLength(2);
      expect(offsetResult.pagination).toMatchObject({
        limit: 2,
        offset: 2,
        page: 2,
      });

      const pageResponse = await helpers.listPortfolios({ limit: 2, page: 3 });

      expect(pageResponse.statusCode).toBe(200);
      const pageResult = helpers.extractResponse(pageResponse);
      expect(pageResult.data).toHaveLength(1); // Only 1 portfolio on page 3 (5 total, 2 per page)
      expect(pageResult.pagination).toMatchObject({
        limit: 2,
        offset: 4, // (page 3 - 1) * limit 2 = 4
        page: 3,
      });
    }, 30000);

    it('should validate limit parameter bounds and negative offset', async () => {
      const aboveMaxLimit = await helpers.listPortfolios({ limit: 101 });
      expect(aboveMaxLimit.statusCode).toBe(ERROR_CODES.ValidationError);

      const negativeOffset = await helpers.listPortfolios({ offset: -1 });
      expect(negativeOffset.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should return only core portfolio data without related entities', async () => {
      const portfolioResponse = await helpers.createPortfolio({
        payload: { name: 'Simple Portfolio', portfolioType: PORTFOLIO_TYPE.investment },
      });
      const portfolio = helpers.extractResponse(portfolioResponse);

      const response = await helpers.listPortfolios();

      expect(response.statusCode).toBe(200);
      const result = helpers.extractResponse(response);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).not.toHaveProperty('balances');
      expect(result.data[0]).not.toHaveProperty('holdings');
      expect(result.data[0]).not.toHaveProperty('transactions');
      expect(result.data[0]).toMatchObject({
        id: portfolio.id,
        name: 'Simple Portfolio',
        portfolioType: PORTFOLIO_TYPE.investment,
        isEnabled: true,
      });
    });
  });
});

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
        portfolioId: generateRandomRecordId(),
      });

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });
});
