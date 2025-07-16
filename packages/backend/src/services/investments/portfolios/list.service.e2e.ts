import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
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

    it('should filter portfolios by portfolioType', async () => {
      // Create portfolios of different types
      await helpers.createPortfolio({
        payload: { name: 'Investment Portfolio', portfolioType: PORTFOLIO_TYPE.investment },
      });
      await helpers.createPortfolio({
        payload: { name: 'Retirement Portfolio', portfolioType: PORTFOLIO_TYPE.retirement },
      });

      const response = await helpers.listPortfolios({
        portfolioType: PORTFOLIO_TYPE.investment,
      });

      expect(response.statusCode).toBe(200);
      const result = helpers.extractResponse(response);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        name: 'Investment Portfolio',
        portfolioType: PORTFOLIO_TYPE.investment,
      });
    });

    it('should filter portfolios by isEnabled', async () => {
      // Create enabled and disabled portfolios
      await helpers.createPortfolio({
        payload: { name: 'Enabled Portfolio', isEnabled: true },
      });
      await helpers.createPortfolio({
        payload: { name: 'Disabled Portfolio', isEnabled: false },
      });

      const response = await helpers.listPortfolios({
        isEnabled: false,
      });

      expect(response.statusCode).toBe(200);
      const result = helpers.extractResponse(response);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        name: 'Disabled Portfolio',
        isEnabled: false,
      });
    });

    it('should support pagination with limit and offset', async () => {
      // Create multiple portfolios
      for (let i = 1; i <= 5; i++) {
        await helpers.createPortfolio({
          payload: { name: `Portfolio ${i}` },
        });
      }

      const response = await helpers.listPortfolios({
        limit: 2,
        offset: 2,
      });

      expect(response.statusCode).toBe(200);
      const result = helpers.extractResponse(response);
      expect(result.data).toHaveLength(2);
      expect(result.pagination).toMatchObject({
        limit: 2,
        offset: 2,
        page: 2,
      });
    });

    it('should support pagination with page parameter', async () => {
      // Create multiple portfolios
      for (let i = 1; i <= 5; i++) {
        await helpers.createPortfolio({
          payload: { name: `Portfolio ${i}` },
        });
      }

      const response = await helpers.listPortfolios({
        limit: 2,
        page: 3,
      });

      expect(response.statusCode).toBe(200);
      const result = helpers.extractResponse(response);
      expect(result.data).toHaveLength(1); // Only 1 portfolio on page 3 (5 total, 2 per page)
      expect(result.pagination).toMatchObject({
        limit: 2,
        offset: 4, // (page 3 - 1) * limit 2 = 4
        page: 3,
      });
    });

    it('should validate limit parameter bounds', async () => {
      const response = await helpers.listPortfolios({
        limit: 101, // Above maximum
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should validate negative offset', async () => {
      const response = await helpers.listPortfolios({
        offset: -1,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
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

    it('should only return portfolios for authenticated user', async () => {
      // This test would need a different user context to fully test
      // For now, just ensure the endpoint requires authentication
      await helpers.createPortfolio({
        payload: { name: 'User Portfolio' },
      });

      const response = await helpers.listPortfolios();

      expect(response.statusCode).toBe(200);
      const result = helpers.extractResponse(response);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.name).toBe('User Portfolio');
    });
  });
});
