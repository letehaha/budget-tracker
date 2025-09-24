import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('List Portfolio Transfers', () => {
  it('should list transfers for a portfolio', async () => {
    // Create source portfolio
    const sourcePortfolio = await helpers.createPortfolio({
      payload: {
        name: 'Source Portfolio',
        portfolioType: PORTFOLIO_TYPE.investment,
      },
      raw: true,
    });

    // Create destination portfolio
    const destPortfolio = await helpers.createPortfolio({
      payload: {
        name: 'Destination Portfolio',
        portfolioType: PORTFOLIO_TYPE.investment,
      },
      raw: true,
    });

    // Add USD currency to user
    const {
      currencies: [usdCurrency],
    } = await helpers.addUserCurrencyByCode({
      code: 'USD',
      raw: true,
    });

    // Create multiple transfers with different dates
    const dates = ['2023-01-01', '2023-02-01', '2023-03-01'];

    for (const date of dates) {
      await helpers.createPortfolioTransfer({
        fromPortfolioId: sourcePortfolio.id,
        payload: {
          toPortfolioId: destPortfolio.id,
          currencyCode: usdCurrency!.currencyCode,
          amount: '100',
          date,
          description: `Transfer on ${date}`,
        },
      });
    }

    // List all transfers
    const response = await helpers.listPortfolioTransfers({
      portfolioId: sourcePortfolio.id,
      raw: true,
    });

    // Verify response structure
    expect(response).toHaveProperty('data');
    expect(response).toHaveProperty('pagination');

    // Verify pagination
    expect(response.pagination).toMatchObject({
      limit: 20,
      offset: 0,
      page: 1,
      totalCount: 3,
    });

    // Verify transfers data
    expect(response.data).toHaveLength(3);

    // Verify transfers are sorted by date DESC by default
    expect(new Date(response.data[0]!.date)).toBeAfter(new Date(response.data[1]!.date));
    expect(new Date(response.data[1]!.date)).toBeAfter(new Date(response.data[2]!.date));

    // Test filtering by date
    const filteredResponse = await helpers.listPortfolioTransfers({
      portfolioId: sourcePortfolio.id,
      dateFrom: '2023-02-01',
      raw: true,
    });

    expect(filteredResponse.data).toHaveLength(2);
    expect(filteredResponse.pagination.totalCount).toBe(2);

    // Test sorting by date ASC
    const ascResponse = await helpers.listPortfolioTransfers({
      portfolioId: sourcePortfolio.id,
      sortDirection: 'ASC',
      raw: true,
    });

    expect(new Date(ascResponse.data[0]!.date)).toBeBefore(new Date(ascResponse.data[1]!.date));
    expect(new Date(ascResponse.data[1]!.date)).toBeBefore(new Date(ascResponse.data[2]!.date));

    // Test pagination
    const paginatedResponse = await helpers.listPortfolioTransfers({
      portfolioId: sourcePortfolio.id,
      limit: 2,
      page: 1,
      raw: true,
    });

    expect(paginatedResponse.data).toHaveLength(2);
    expect(paginatedResponse.pagination).toMatchObject({
      limit: 2,
      page: 1,
      totalCount: 3,
    });
  });

  it('should return transfers where portfolio is destination', async () => {
    // Create source portfolio
    const sourcePortfolio = await helpers.createPortfolio({
      payload: {
        name: 'Another Source Portfolio',
        portfolioType: PORTFOLIO_TYPE.investment,
      },
      raw: true,
    });

    // Create destination portfolio
    const destPortfolio = await helpers.createPortfolio({
      payload: {
        name: 'Another Destination Portfolio',
        portfolioType: PORTFOLIO_TYPE.investment,
      },
      raw: true,
    });

    // Add USD currency to user
    const {
      currencies: [usdCurrency],
    } = await helpers.addUserCurrencyByCode({
      code: 'USD',
      raw: true,
    });

    // Create a transfer
    await helpers.createPortfolioTransfer({
      fromPortfolioId: sourcePortfolio.id,
      payload: {
        toPortfolioId: destPortfolio.id,
        currencyCode: usdCurrency!.currencyCode,
        amount: '200',
        date: '2023-04-01',
        description: 'Test transfer to destination',
      },
    });

    // List transfers for destination portfolio
    const response = await helpers.listPortfolioTransfers({
      portfolioId: destPortfolio.id,
      raw: true,
    });

    // Verify response
    expect(response.data).toHaveLength(1);
    expect(response.data[0]!.toPortfolioId).toBe(destPortfolio.id);
    expect(response.data[0]!.amount).toBeNumericEqual('200');
  });

  it('should return 404 for non-existent portfolio', async () => {
    const response = await helpers.listPortfolioTransfers({
      portfolioId: 99999,
    });

    expect(response.statusCode).toEqual(ERROR_CODES.NotFoundError);
  });
});
