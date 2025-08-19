import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import Holdings from '@models/investments/Holdings.model';
import Portfolios from '@models/investments/Portfolios.model';
import Securities from '@models/investments/Securities.model';
import { restClient } from '@polygon.io/client-js';
import * as helpers from '@tests/helpers';

const mockedRestClient = jest.mocked(restClient);
const mockApi = mockedRestClient.getMockImplementation()!('test');
const mockedAggregates = jest.mocked(mockApi.stocks.aggregates);

describe('POST /holdings (create holding)', () => {
  let investmentPortfolio: Portfolios;
  let vooSecurity: Securities;

  beforeEach(async () => {
    jest.clearAllMocks();

    investmentPortfolio = await helpers.createPortfolio({
      payload: helpers.buildPortfolioPayload({
        name: 'Test Investment Portfolio',
      }),
      raw: true,
    });

    const seededSecurities = await helpers.seedSecurities([{ symbol: 'VOO', name: 'Vanguard S&P 500 ETF' }]);
    const firstSecurity = seededSecurities[0];
    if (!firstSecurity) throw new Error('VOO security not found after seeding');
    vooSecurity = firstSecurity;
  });

  it('should create a holding successfully', async () => {
    const response = await helpers.createHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
      },
    });

    expect(response.statusCode).toBe(201);

    const holding = await Holdings.findOne({
      where: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
      },
    });

    expect(holding).toBeTruthy();
    expect(holding?.quantity).toBeNumericEqual(0);
    expect(holding?.costBasis).toBeNumericEqual(0);
    expect(holding?.value).toBeNumericEqual(0);
    expect(holding?.currencyCode).toBe(vooSecurity.currencyCode);
  });

  it('should fail to create a holding for non-existent portfolio', async () => {
    const response = await helpers.createHolding({
      payload: {
        portfolioId: 999999,
        securityId: vooSecurity.id,
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('should fail to create a holding for non-existent security', async () => {
    const response = await helpers.createHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: 999999,
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('should fail to create a duplicate holding', async () => {
    // Create first holding
    await helpers.createHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
      },
    });

    // Try to create duplicate
    const response = await helpers.createHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.ConflictError);
  });

  it('fails if required fields are missing', async () => {
    // Missing portfolioId
    const payloadMissingPortfolioId = { securityId: vooSecurity.id } as Parameters<
      typeof helpers.createHolding
    >[0]['payload'];

    let response = await helpers.createHolding({
      payload: payloadMissingPortfolioId,
      raw: false,
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);

    // Missing securityId
    const payloadMissingSecurityId = { portfolioId: investmentPortfolio.id } as Parameters<
      typeof helpers.createHolding
    >[0]['payload'];

    response = await helpers.createHolding({
      payload: payloadMissingSecurityId,
      raw: false,
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('background sync is not called on duplicate', async () => {
    await helpers.createHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
      },
    });

    await helpers.sleep(200); // sync is triggered in background, so we need to wait for it to clear

    mockedAggregates.mockClear();

    const response = await helpers.createHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
      },
      raw: false,
    });
    expect(response.statusCode).toBe(ERROR_CODES.ConflictError);
    expect(mockedAggregates).not.toHaveBeenCalled();
  });

  it('correctly sets all default values', async () => {
    mockedAggregates.mockResolvedValue({
      results: [{ c: 123, t: new Date().getTime() }],
    });
    const holding = await helpers.createHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
      },
      raw: true,
    });
    expect(holding.quantity).toBeNumericEqual(0);
    expect(holding.costBasis).toBeNumericEqual(0);
    expect(holding.refCostBasis).toBeNumericEqual(0);
    expect(holding.value).toBeNumericEqual(0);
    expect(holding.refValue).toBeNumericEqual(0);
    expect(typeof holding.currencyCode).toBe('string');
    expect(holding.portfolioId).toBe(investmentPortfolio.id);
    expect(holding.securityId).toBe(vooSecurity.id);
  });

  it.todo('prevents race condition on duplicate (only one succeeds)');
});
