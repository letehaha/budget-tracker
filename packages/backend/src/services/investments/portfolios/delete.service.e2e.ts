import { ACCOUNT_CATEGORIES } from '@bt/shared/types';
import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Delete Portfolio Service E2E', () => {
  describe('DELETE /investments/portfolios/:id', () => {
    describe('Success cases', () => {
      it('should delete empty portfolio successfully', async () => {
        const createResponse = await helpers.createPortfolio();
        const createdPortfolio = helpers.extractResponse(createResponse);

        const deleteResponse = await helpers.deletePortfolio({
          portfolioId: createdPortfolio.id,
        });

        expect(deleteResponse.statusCode).toBe(200);
        const result = helpers.extractResponse(deleteResponse);
        expect(result.success).toBe(true);

        // Verify portfolio is deleted
        const getResponse = await helpers.getPortfolio({
          portfolioId: createdPortfolio.id,
        });
        expect(getResponse.statusCode).toBe(ERROR_CODES.NotFoundError);
      });

      it('should handle deleting same portfolio multiple times gracefully', async () => {
        const createResponse = await helpers.createPortfolio();
        const createdPortfolio = helpers.extractResponse(createResponse);

        // Delete portfolio first time
        const firstDeleteResponse = await helpers.deletePortfolio({
          portfolioId: createdPortfolio.id,
        });
        expect(firstDeleteResponse.statusCode).toBe(200);

        // Delete same portfolio again - should still return success
        const secondDeleteResponse = await helpers.deletePortfolio({
          portfolioId: createdPortfolio.id,
        });
        expect(secondDeleteResponse.statusCode).toBe(200);
      });

      it('should handle non-existent portfolio gracefully', async () => {
        const deleteResponse = await helpers.deletePortfolio({
          portfolioId: 99999,
        });

        expect(deleteResponse.statusCode).toBe(200);
      });
    });

    describe('Validation errors', () => {
      it('should return ValidationError for invalid portfolio ID', async () => {
        const deleteResponse = await helpers.deletePortfolio({
          portfolioId: 'invalid' as unknown as number,
        });

        expect(deleteResponse.statusCode).toBe(ERROR_CODES.ValidationError);
      });

      it('should prevent deletion of portfolio with cash balances', async () => {
        const createdPortfolio = await helpers.createPortfolio({ raw: true });

        // Create a portfolio balance using the dedicated helper
        const balanceResponse = await helpers.updatePortfolioBalance({
          portfolioId: createdPortfolio.id,
          currencyId: global.BASE_CURRENCY.id,
          setTotalCash: '1000.00',
          setAvailableCash: '500.00',
        });

        expect(balanceResponse.statusCode).toBe(200);

        // Try to delete portfolio with cash balances
        const deleteResponse = await helpers.deletePortfolio({
          portfolioId: createdPortfolio.id,
        });

        expect(deleteResponse.statusCode).toBe(ERROR_CODES.ValidationError);
      });
    });

    describe('Force delete', () => {
      it('should force delete portfolio with all related data', async () => {
        const createdPortfolio = await helpers.createPortfolio({ raw: true });

        // Create an investment account for holdings and transactions
        const investmentAccount = await helpers.createAccount({
          payload: helpers.buildAccountPayload({
            accountCategory: ACCOUNT_CATEGORIES.investment,
            name: 'Investment Account',
          }),
          raw: true,
        });

        // Seed securities
        const seededSecurities = await helpers.seedSecuritiesViaSync([
          { symbol: 'VOO', name: 'Vanguard S&P 500 ETF' },
          { symbol: 'AAPL', name: 'Apple Inc.' },
        ]);
        const vooSecurity = seededSecurities.find((s) => s.symbol === 'VOO')!;
        const aaplSecurity = seededSecurities.find((s) => s.symbol === 'AAPL')!;

        // Create holdings
        await helpers.createHolding({
          payload: {
            accountId: investmentAccount.id,
            securityId: vooSecurity.id,
          },
        });
        await helpers.createHolding({
          payload: {
            accountId: investmentAccount.id,
            securityId: aaplSecurity.id,
          },
        });

        // Create investment transactions
        await helpers.createInvestmentTransaction({
          payload: {
            accountId: investmentAccount.id,
            securityId: vooSecurity.id,
            category: INVESTMENT_TRANSACTION_CATEGORY.buy,
            quantity: '10',
            price: '100',
            fees: '5',
          },
        });
        await helpers.createInvestmentTransaction({
          payload: {
            accountId: investmentAccount.id,
            securityId: aaplSecurity.id,
            category: INVESTMENT_TRANSACTION_CATEGORY.buy,
            quantity: '5',
            price: '150',
            fees: '2.50',
          },
        });

        // Create a portfolio balance using the dedicated helper
        await helpers.updatePortfolioBalance({
          portfolioId: createdPortfolio.id,
          currencyId: global.BASE_CURRENCY.id,
          setTotalCash: '1000.00',
          setAvailableCash: '500.00',
        });

        // Force delete should succeed even with balances, holdings, and transactions
        const deleteResponse = await helpers.deletePortfolio({
          portfolioId: createdPortfolio.id,
          force: true,
        });

        expect(deleteResponse.statusCode).toBe(200);

        // Verify portfolio is deleted
        const getResponse = await helpers.getPortfolio({
          portfolioId: createdPortfolio.id,
        });
        expect(getResponse.statusCode).toBe(ERROR_CODES.NotFoundError);
      });

      it('should handle force delete with force=false query parameter', async () => {
        const createdPortfolio = await helpers.createPortfolio({ raw: true });

        // Create an investment account for holdings and transactions
        const investmentAccount = await helpers.createAccount({
          payload: helpers.buildAccountPayload({
            accountCategory: ACCOUNT_CATEGORIES.investment,
            name: 'Investment Account',
          }),
          raw: true,
        });

        // Seed securities
        const seededSecurities = await helpers.seedSecuritiesViaSync([{ symbol: 'TSLA', name: 'Tesla Inc.' }]);
        const teslaSecurity = seededSecurities.find((s) => s.symbol === 'TSLA')!;

        // Create holding and transaction
        await helpers.createHolding({
          payload: {
            accountId: investmentAccount.id,
            securityId: teslaSecurity.id,
          },
        });
        await helpers.createInvestmentTransaction({
          payload: {
            accountId: investmentAccount.id,
            securityId: teslaSecurity.id,
            category: INVESTMENT_TRANSACTION_CATEGORY.buy,
            quantity: '3',
            price: '200',
            fees: '1.00',
          },
        });

        // Create a portfolio balance using the dedicated helper
        await helpers.updatePortfolioBalance({
          portfolioId: createdPortfolio.id,
          currencyId: global.BASE_CURRENCY.id,
          setTotalCash: '1000.00',
        });

        // Delete with force=false should fail when there are balances/holdings/transactions
        const deleteResponse = await helpers.deletePortfolio({
          portfolioId: createdPortfolio.id,
          force: false,
        });

        expect(deleteResponse.statusCode).toBe(ERROR_CODES.ValidationError);
      });
    });
  });
});
