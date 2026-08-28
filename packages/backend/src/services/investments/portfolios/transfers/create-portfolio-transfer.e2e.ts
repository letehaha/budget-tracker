import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Portfolio Transfer', () => {
  it('should transfer funds between portfolios', async () => {
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
    } = await helpers.addUserCurrencies({ currencyCodes: ['USD'], raw: true });

    // Add funds to source portfolio
    await helpers.updatePortfolioBalance({
      portfolioId: sourcePortfolio.id,
      currencyCode: usdCurrency!.currencyCode,
      setAvailableCash: '1000',
      setTotalCash: '1000',
    });

    // Execute transfer
    const transferAmount = '500';
    const transfer = await helpers.createPortfolioTransfer({
      fromPortfolioId: sourcePortfolio.id,
      payload: helpers.buildPortfolioTransferPayload({
        toPortfolioId: destPortfolio.id,
        currencyCode: usdCurrency!.currencyCode,
        amount: transferAmount,
        description: 'Test transfer',
      }),
      raw: true,
    });

    // Verify transfer record
    expect(transfer).toMatchObject({
      id: expect.any(String),
      userId: expect.any(Number),
      fromPortfolioId: sourcePortfolio.id,
      toPortfolioId: destPortfolio.id,
      amount: expect.toBeNumericEqual(transferAmount),
      refAmount: expect.any(String),
      currencyCode: usdCurrency!.currencyCode,
      date: expect.any(String),
      description: 'Test transfer',
    });

    // Verify source portfolio balance
    const [sourceBalance] = await helpers.getPortfolioBalance({
      portfolioId: sourcePortfolio.id,
      currencyCode: usdCurrency!.currencyCode,
      raw: true,
    });

    expect(sourceBalance!.availableCash).toBeNumericEqual(500);
    expect(sourceBalance!.totalCash).toBeNumericEqual(500);

    // Verify destination portfolio balance
    const [destBalance] = await helpers.getPortfolioBalance({
      portfolioId: destPortfolio.id,
      currencyCode: usdCurrency!.currencyCode,
      raw: true,
    });

    expect(destBalance!.availableCash).toBeNumericEqual(500);
    expect(destBalance!.totalCash).toBeNumericEqual(500);
  });

  it('should reject unknown source/destination portfolios, zero or negative amounts and a same-portfolio transfer', async () => {
    const sourcePortfolio = await helpers.createPortfolio({ payload: { name: 'Source' }, raw: true });
    const destPortfolio = await helpers.createPortfolio({ payload: { name: 'Destination' }, raw: true });
    const {
      currencies: [usdCurrency],
    } = await helpers.addUserCurrencies({ currencyCodes: ['USD'], raw: true });

    const unknownDestination = await helpers.createPortfolioTransfer({
      fromPortfolioId: sourcePortfolio.id,
      payload: helpers.buildPortfolioTransferPayload({
        toPortfolioId: generateRandomRecordId(),
        currencyCode: usdCurrency!.currencyCode,
      }),
    });
    expect(unknownDestination.statusCode).toBe(ERROR_CODES.NotFoundError);

    const unknownSource = await helpers.createPortfolioTransfer({
      fromPortfolioId: generateRandomRecordId(),
      payload: helpers.buildPortfolioTransferPayload({
        toPortfolioId: sourcePortfolio.id,
        currencyCode: usdCurrency!.currencyCode,
      }),
    });
    expect(unknownSource.statusCode).toBe(ERROR_CODES.NotFoundError);

    const zeroAmount = await helpers.createPortfolioTransfer({
      fromPortfolioId: sourcePortfolio.id,
      payload: helpers.buildPortfolioTransferPayload({
        toPortfolioId: destPortfolio.id,
        currencyCode: usdCurrency!.currencyCode,
        amount: '0',
      }),
    });
    expect(zeroAmount.statusCode).toBe(ERROR_CODES.ValidationError);

    const negativeAmount = await helpers.createPortfolioTransfer({
      fromPortfolioId: sourcePortfolio.id,
      payload: helpers.buildPortfolioTransferPayload({
        toPortfolioId: destPortfolio.id,
        currencyCode: usdCurrency!.currencyCode,
        amount: '-100',
      }),
    });
    expect(negativeAmount.statusCode).toBe(ERROR_CODES.ValidationError);

    const samePortfolio = await helpers.createPortfolioTransfer({
      fromPortfolioId: sourcePortfolio.id,
      payload: helpers.buildPortfolioTransferPayload({
        toPortfolioId: sourcePortfolio.id,
        currencyCode: usdCurrency!.currencyCode,
      }),
    });
    expect(samePortfolio.statusCode).toBe(ERROR_CODES.ValidationError);
  }, 30000);
});
