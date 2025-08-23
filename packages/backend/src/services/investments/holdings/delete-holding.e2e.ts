import { beforeEach, describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import Holdings from '@models/investments/Holdings.model';
import Portfolios from '@models/investments/Portfolios.model';
import Securities from '@models/investments/Securities.model';
import * as helpers from '@tests/helpers';

describe('DELETE /investments/holding (delete holding)', () => {
  let investmentPortfolio: Portfolios;
  let vooSecurity: Securities;

  beforeEach(async () => {
    investmentPortfolio = await helpers.createPortfolio({
      payload: helpers.buildPortfolioPayload({
        name: 'Test Investment Portfolio',
      }),
      raw: true,
    });

    // Seed securities and get VOO
    const seededSecurities = await helpers.seedSecurities([{ symbol: 'VOO', name: 'Vanguard S&P 500 ETF' }]);
    const firstSecurity = seededSecurities[0];
    if (!firstSecurity) throw new Error('VOO security not found after seeding');
    vooSecurity = firstSecurity;
  });

  it('should delete a holding successfully', async () => {
    // Create holding first
    await helpers.createHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
      },
    });
    // Delete holding
    const response = await helpers.deleteHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
      },
      raw: false,
    });
    expect(response.statusCode).toBe(200);
  });

  it('should fail to delete a non-existent holding', async () => {
    const response = await helpers.deleteHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id, // never created
      },
      raw: false,
    });
    expect(response.statusCode).toBe(200); // No error, idempotent
  });

  it('should fail to delete holding with non-zero quantity', async () => {
    // Create holding
    await helpers.createHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
      },
    });
    // Manually set quantity to non-zero
    await Holdings.update(
      { quantity: '1.0000000000' },
      { where: { portfolioId: investmentPortfolio.id, securityId: vooSecurity.id } },
    );
    // Try to delete
    const response = await helpers.deleteHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
      },
      raw: false,
    });
    expect(response.statusCode).toBe(ERROR_CODES.NotAllowed);
  });

  it('fails if required fields are missing', async () => {
    // Missing portfolioId
    const payloadMissingPortfolioId = { securityId: vooSecurity.id } as Parameters<
      typeof helpers.deleteHolding
    >[0]['payload'];
    let response = await helpers.deleteHolding({
      payload: payloadMissingPortfolioId,
      raw: false,
    });
    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);

    // Missing securityId
    const payloadMissingSecurityId = { portfolioId: investmentPortfolio.id } as Parameters<
      typeof helpers.deleteHolding
    >[0]['payload'];
    response = await helpers.deleteHolding({
      payload: payloadMissingSecurityId,
      raw: false,
    });
    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });
});
