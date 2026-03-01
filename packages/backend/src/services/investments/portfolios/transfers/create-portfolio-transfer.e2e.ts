import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
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
      id: expect.any(Number),
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

  it('should validate source and destination portfolios', async () => {
    const sourcePortfolio = await helpers.createPortfolio({ raw: true });
    const {
      currencies: [usdCurrency],
    } = await helpers.addUserCurrencies({ currencyCodes: ['USD'], raw: true });

    // Try to transfer to non-existent portfolio
    expect(
      (
        await helpers.createPortfolioTransfer({
          fromPortfolioId: sourcePortfolio.id,
          payload: helpers.buildPortfolioTransferPayload({
            toPortfolioId: 999999, // Non-existent portfolio
            currencyCode: usdCurrency!.currencyCode,
          }),
        })
      ).statusCode,
    ).toBe(ERROR_CODES.NotFoundError);

    // Try to transfer from non-existent portfolio
    expect(
      (
        await helpers.createPortfolioTransfer({
          fromPortfolioId: 999999, // Non-existent portfolio
          payload: helpers.buildPortfolioTransferPayload({
            toPortfolioId: sourcePortfolio.id,
            currencyCode: usdCurrency!.currencyCode,
          }),
        })
      ).statusCode,
    ).toBe(ERROR_CODES.NotFoundError);
  });

  it('should validate transfer amount', async () => {
    // Create source and destination portfolios
    const sourcePortfolio = await helpers.createPortfolio({ payload: { name: 'Source' }, raw: true });
    const destPortfolio = await helpers.createPortfolio({ payload: { name: 'Destination' }, raw: true });

    // Add USD currency to user
    const {
      currencies: [usdCurrency],
    } = await helpers.addUserCurrencies({ currencyCodes: ['USD'], raw: true });

    // Try to transfer zero amount
    expect(
      (
        await helpers.createPortfolioTransfer({
          fromPortfolioId: sourcePortfolio.id,
          payload: helpers.buildPortfolioTransferPayload({
            toPortfolioId: destPortfolio.id,
            currencyCode: usdCurrency!.currencyCode,
            amount: '0',
          }),
        })
      ).statusCode,
    ).toBe(ERROR_CODES.ValidationError);

    // Try to transfer negative amount
    expect(
      (
        await helpers.createPortfolioTransfer({
          fromPortfolioId: sourcePortfolio.id,
          payload: helpers.buildPortfolioTransferPayload({
            toPortfolioId: destPortfolio.id,
            currencyCode: usdCurrency!.currencyCode,
            amount: '-100',
          }),
        })
      ).statusCode,
    ).toBe(ERROR_CODES.ValidationError);
  });

  it('should reject transfer to non-existent destination portfolio', async () => {
    const sourcePortfolio = await helpers.createPortfolio({
      payload: { name: 'Source' },
      raw: true,
    });

    const {
      currencies: [usdCurrency],
    } = await helpers.addUserCurrencies({ currencyCodes: ['USD'], raw: true });

    await helpers.updatePortfolioBalance({
      portfolioId: sourcePortfolio.id,
      currencyCode: usdCurrency!.currencyCode,
      setAvailableCash: '1000',
      setTotalCash: '1000',
    });

    const response = await helpers.createPortfolioTransfer({
      fromPortfolioId: sourcePortfolio.id,
      payload: helpers.buildPortfolioTransferPayload({
        toPortfolioId: 999999,
        currencyCode: usdCurrency!.currencyCode,
        amount: '100',
      }),
    });

    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('should not allow transfer to the same portfolio', async () => {
    const portfolio = await helpers.createPortfolio({ raw: true });
    const {
      currencies: [usdCurrency],
    } = await helpers.addUserCurrencies({ currencyCodes: ['USD'], raw: true });

    // Try to transfer to the same portfolio
    const response = await helpers.createPortfolioTransfer({
      fromPortfolioId: portfolio.id,
      payload: helpers.buildPortfolioTransferPayload({
        toPortfolioId: portfolio.id,
        currencyCode: usdCurrency!.currencyCode,
      }),
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });
});
