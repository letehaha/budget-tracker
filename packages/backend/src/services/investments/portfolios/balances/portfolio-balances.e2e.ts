import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Portfolio Balances E2E', () => {
  describe('PUT /investments/portfolios/:id/balance', () => {
    describe('Validation errors', () => {
      it('should return 422 for a non-decimal cash field, combined delta/set fields or no cash fields, and 404 for an unknown portfolio', async () => {
        const portfolio = await helpers.createPortfolio({ raw: true });

        const nonDecimal = await helpers.updatePortfolioBalance({
          portfolioId: portfolio.id,
          currencyCode: global.BASE_CURRENCY.code,
          availableCashDelta: 'hello',
        });
        expect(nonDecimal.statusCode).toBe(ERROR_CODES.ValidationError);

        const combinedFields = await helpers.updatePortfolioBalance({
          portfolioId: portfolio.id,
          currencyCode: global.BASE_CURRENCY.code,
          availableCashDelta: '10.00',
          setTotalCash: '100.00',
        });
        expect(combinedFields.statusCode).toBe(ERROR_CODES.ValidationError);

        const noCashFields = await helpers.updatePortfolioBalance({
          portfolioId: portfolio.id,
          currencyCode: global.BASE_CURRENCY.code,
        });
        expect(noCashFields.statusCode).toBe(ERROR_CODES.ValidationError);

        const unknownPortfolio = await helpers.updatePortfolioBalance({
          portfolioId: generateRandomRecordId(),
          currencyCode: global.BASE_CURRENCY.code,
          setTotalCash: '100.00',
        });
        expect(unknownPortfolio.statusCode).toBe(ERROR_CODES.NotFoundError);
      }, 30000);
    });

    describe('Happy path', () => {
      it('should update total cash with setTotalCash alone, leaving available cash unchanged', async () => {
        const portfolio = await helpers.createPortfolio({ raw: true });

        const result = await helpers.updatePortfolioBalance({
          portfolioId: portfolio.id,
          currencyCode: global.BASE_CURRENCY.code,
          setTotalCash: '500.00',
          raw: true,
        });

        expect(result.totalCash).toBe(500);
        expect(result.availableCash).toBe(0);
      });

      it('should set available cash alone and then apply availableCashDelta on top, leaving total cash unchanged', async () => {
        const portfolio = await helpers.createPortfolio({ raw: true });

        const setResult = await helpers.updatePortfolioBalance({
          portfolioId: portfolio.id,
          currencyCode: global.BASE_CURRENCY.code,
          setAvailableCash: '250.50',
          raw: true,
        });

        expect(setResult.availableCash).toBe(250.5);
        expect(setResult.totalCash).toBe(0);

        const deltaResult = await helpers.updatePortfolioBalance({
          portfolioId: portfolio.id,
          currencyCode: global.BASE_CURRENCY.code,
          availableCashDelta: '50.00',
          raw: true,
        });

        expect(deltaResult.availableCash).toBe(300.5);
        expect(deltaResult.totalCash).toBe(0);
      });
    });
  });

  describe('GET /investments/portfolios/:id/balance', () => {
    it('should return an empty balance list with and without a currencyCode filter', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: {
          name: 'Test Portfolio',
          portfolioType: PORTFOLIO_TYPE.investment,
          description: 'Test portfolio description',
        },
        raw: true,
      });

      const balances = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        raw: true,
      });

      expect(Array.isArray(balances)).toBe(true);
      expect(balances).toEqual([]);

      const filteredBalances = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode: 'USD',
        raw: true,
      });

      expect(filteredBalances).toEqual([]);
    });

    it('should return 404 when portfolio does not exist', async () => {
      const response = await helpers.getPortfolioBalance({
        portfolioId: generateRandomRecordId(),
      });

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });
});
