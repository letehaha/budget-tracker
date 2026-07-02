import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Update Portfolio Balance E2E', () => {
  describe('PUT /investments/portfolios/:id/balance', () => {
    describe('Validation errors', () => {
      it('should return 422 when a cash field contains a non-decimal string', async () => {
        const portfolio = await helpers.createPortfolio({ raw: true });

        const response = await helpers.updatePortfolioBalance({
          portfolioId: portfolio.id,
          currencyCode: global.BASE_CURRENCY.code,
          availableCashDelta: 'hello',
        });

        expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      });

      it('should return 422 when delta and set fields are combined in the same request', async () => {
        const portfolio = await helpers.createPortfolio({ raw: true });

        const response = await helpers.updatePortfolioBalance({
          portfolioId: portfolio.id,
          currencyCode: global.BASE_CURRENCY.code,
          availableCashDelta: '10.00',
          setTotalCash: '100.00',
        });

        expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      });

      it('should return 422 when none of the four cash fields are provided', async () => {
        const portfolio = await helpers.createPortfolio({ raw: true });

        const response = await helpers.updatePortfolioBalance({
          portfolioId: portfolio.id,
          currencyCode: global.BASE_CURRENCY.code,
        });

        expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      });

      it('should return 404 when portfolio does not exist', async () => {
        const response = await helpers.updatePortfolioBalance({
          portfolioId: generateRandomRecordId(),
          currencyCode: global.BASE_CURRENCY.code,
          setTotalCash: '100.00',
        });

        expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
      });
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

      it('should update available cash with setAvailableCash alone, leaving total cash unchanged', async () => {
        const portfolio = await helpers.createPortfolio({ raw: true });

        const result = await helpers.updatePortfolioBalance({
          portfolioId: portfolio.id,
          currencyCode: global.BASE_CURRENCY.code,
          setAvailableCash: '250.50',
          raw: true,
        });

        expect(result.availableCash).toBe(250.5);
        expect(result.totalCash).toBe(0);
      });

      it('should apply availableCashDelta independently without requiring totalCashDelta', async () => {
        const portfolio = await helpers.createPortfolio({ raw: true });

        // Seed a starting balance so the delta has a non-zero base
        await helpers.updatePortfolioBalance({
          portfolioId: portfolio.id,
          currencyCode: global.BASE_CURRENCY.code,
          setAvailableCash: '100.00',
          raw: true,
        });

        const result = await helpers.updatePortfolioBalance({
          portfolioId: portfolio.id,
          currencyCode: global.BASE_CURRENCY.code,
          availableCashDelta: '50.00',
          raw: true,
        });

        expect(result.availableCash).toBe(150);
        expect(result.totalCash).toBe(0);
      });
    });
  });
});
