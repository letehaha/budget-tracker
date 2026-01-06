import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Create Portfolio Service E2E', () => {
  describe('POST /investments/portfolios', () => {
    it('should create a portfolio successfully with all required fields', async () => {
      const portfolioData = helpers.buildPortfolioPayload({
        name: 'My Investment Portfolio',
        portfolioType: PORTFOLIO_TYPE.investment,
        description: 'A test investment portfolio',
      });

      const response = await helpers.createPortfolio({ payload: portfolioData });

      expect(response.statusCode).toBe(200);

      const portfolio = helpers.extractResponse(response);

      expect(portfolio).toMatchObject({
        name: 'My Investment Portfolio',
        portfolioType: PORTFOLIO_TYPE.investment,
        description: 'A test investment portfolio',
        isEnabled: true,
      });
    });

    it('should create a portfolio with minimal required fields', async () => {
      const portfolioData = helpers.buildPortfolioPayload({
        name: 'Minimal Portfolio',
      });

      const portfolio = await helpers.createPortfolio({ payload: portfolioData, raw: true });

      expect(portfolio).toMatchObject({
        name: 'Minimal Portfolio',
        portfolioType: PORTFOLIO_TYPE.investment, // default value
        isEnabled: true, // default value
      });

      expect(portfolio.description).toBe('Test portfolio description'); // from buildPortfolioPayload default
    });

    it('should create portfolios with different portfolio types', async () => {
      const portfolioTypes = [
        PORTFOLIO_TYPE.investment,
        PORTFOLIO_TYPE.retirement,
        PORTFOLIO_TYPE.savings,
        PORTFOLIO_TYPE.other,
      ];

      for (const portfolioType of portfolioTypes) {
        const portfolioData = helpers.buildPortfolioPayload({
          name: `${portfolioType} Portfolio ${Date.now()}`, // Make name unique
          portfolioType,
        });

        const portfolio = await helpers.createPortfolio({ payload: portfolioData, raw: true });

        expect(portfolio.portfolioType).toBe(portfolioType);
      }
    });

    it('should create a disabled portfolio when isEnabled is false', async () => {
      const portfolioData = helpers.buildPortfolioPayload({
        name: 'Disabled Portfolio',
        isEnabled: false,
      });

      const portfolio = await helpers.createPortfolio({ payload: portfolioData, raw: true });

      expect(portfolio.isEnabled).toBe(false);
    });

    it('should trim portfolio name', async () => {
      const portfolioData = helpers.buildPortfolioPayload({
        name: '  Trimmed Portfolio  ',
      });

      const portfolio = await helpers.createPortfolio({ payload: portfolioData, raw: true });

      expect(portfolio.name).toBe('Trimmed Portfolio');
    });

    it('should reject portfolio creation with duplicate name for same user', async () => {
      const portfolioData = helpers.buildPortfolioPayload({
        name: 'Duplicate Portfolio',
      });

      // Create first portfolio
      const firstResponse = await helpers.createPortfolio({ payload: portfolioData });
      expect(firstResponse.statusCode).toBe(200);

      // Try to create second portfolio with same name
      const secondResponse = await helpers.createPortfolio({ payload: portfolioData });
      expect(secondResponse.statusCode).toBe(ERROR_CODES.ConflictError);
    });

    it('should reject portfolio creation with empty name', async () => {
      const portfolioData = helpers.buildPortfolioPayload({
        name: '',
      });

      const response = await helpers.createPortfolio({ payload: portfolioData });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should reject portfolio creation with name too long', async () => {
      const portfolioData = helpers.buildPortfolioPayload({
        name: 'a'.repeat(101), // 101 characters
      });

      const response = await helpers.createPortfolio({ payload: portfolioData });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should reject portfolio creation with description too long', async () => {
      const portfolioData = helpers.buildPortfolioPayload({
        name: 'Valid Portfolio',
        description: 'a'.repeat(501), // 501 characters
      });

      const response = await helpers.createPortfolio({ payload: portfolioData });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should reject portfolio creation with invalid portfolio type', async () => {
      const response = await helpers.createPortfolio({
        payload: {
          ...helpers.buildPortfolioPayload(),
          portfolioType: 'invalid_type' as PORTFOLIO_TYPE,
        },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should create multiple portfolios for the same user', async () => {
      const portfolio1Data = helpers.buildPortfolioPayload({
        name: 'Portfolio 1',
        portfolioType: PORTFOLIO_TYPE.investment,
      });

      const portfolio2Data = helpers.buildPortfolioPayload({
        name: 'Portfolio 2',
        portfolioType: PORTFOLIO_TYPE.retirement,
      });

      const response1 = await helpers.createPortfolio({ payload: portfolio1Data });
      const response2 = await helpers.createPortfolio({ payload: portfolio2Data });

      expect(response1.statusCode).toBe(200);
      expect(response2.statusCode).toBe(200);

      const portfolio1 = helpers.extractResponse(response1);
      const portfolio2 = helpers.extractResponse(response2);

      expect(portfolio1.name).toBe('Portfolio 1');
      expect(portfolio2.name).toBe('Portfolio 2');
      expect(portfolio1.userId).toBe(portfolio2.userId);
    });
  });
});
