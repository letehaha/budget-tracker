import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
import { describe, expect, it } from '@jest/globals';
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
    const usdCurrency = await helpers.addUserCurrencies({ currencyCodes: ['USD'] });

    // Add funds to source portfolio
    await helpers.updatePortfolioBalance({
      portfolioId: sourcePortfolio.id,
      currencyId: usdCurrency[0].currencyId,
      setAvailableCash: '1000',
      setTotalCash: '1000',
    });

    // Execute transfer
    const transferAmount = '500';
    const transfer = await helpers.createPortfolioTransfer({
      fromPortfolioId: sourcePortfolio.id,
      payload: helpers.buildPortfolioTransferPayload({
        toPortfolioId: destPortfolio.id,
        currencyId: usdCurrency[0].currencyId,
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
      amount: transferAmount,
      refAmount: expect.any(String),
      currencyId: usdCurrency[0].currencyId,
      date: expect.any(String),
      description: 'Test transfer',
    });

    // Verify source portfolio balance
    const sourceBalance = await helpers.updatePortfolioBalance({
      portfolioId: sourcePortfolio.id,
      currencyId: usdCurrency[0].currencyId,
      raw: true,
    });

    expect(sourceBalance.availableCash).toBe('500.0000000000');
    expect(sourceBalance.totalCash).toBe('500.0000000000');

    // Verify destination portfolio balance
    const destBalance = await helpers.updatePortfolioBalance({
      portfolioId: destPortfolio.id,
      currencyId: usdCurrency[0].currencyId,
      raw: true,
    });

    expect(destBalance.availableCash).toBe('500.0000000000');
    expect(destBalance.totalCash).toBe('500.0000000000');
  });

  it('should validate source and destination portfolios', async () => {
    // Create source portfolio
    const sourcePortfolio = await helpers.createPortfolio({ raw: true });

    // Add USD currency to user
    const usdCurrency = await helpers.addUserCurrencies({ currencyCodes: ['USD'] });

    // Try to transfer to non-existent portfolio
    await expect(
      helpers.createPortfolioTransfer({
        fromPortfolioId: sourcePortfolio.id,
        payload: helpers.buildPortfolioTransferPayload({
          toPortfolioId: 999999, // Non-existent portfolio
          currencyId: usdCurrency[0].currencyId,
        }),
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('Destination portfolio not found'),
    });

    // Try to transfer from non-existent portfolio
    await expect(
      helpers.createPortfolioTransfer({
        fromPortfolioId: 999999, // Non-existent portfolio
        payload: helpers.buildPortfolioTransferPayload({
          toPortfolioId: sourcePortfolio.id,
          currencyId: usdCurrency[0].currencyId,
        }),
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('Source portfolio not found'),
    });
  });

  it('should validate transfer amount', async () => {
    // Create source and destination portfolios
    const sourcePortfolio = await helpers.createPortfolio({ payload: { name: 'Source' }, raw: true });
    const destPortfolio = await helpers.createPortfolio({ payload: { name: 'Destination' }, raw: true });

    // Add USD currency to user
    const usdCurrency = await helpers.addUserCurrencies({ currencyCodes: ['USD'] });

    // Try to transfer zero amount
    await expect(
      helpers.createPortfolioTransfer({
        fromPortfolioId: sourcePortfolio.id,
        payload: helpers.buildPortfolioTransferPayload({
          toPortfolioId: destPortfolio.id,
          currencyId: usdCurrency[0].currencyId,
          amount: '0',
        }),
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('Amount must be a valid number greater than 0'),
    });

    // Try to transfer negative amount
    await expect(
      helpers.createPortfolioTransfer({
        fromPortfolioId: sourcePortfolio.id,
        payload: helpers.buildPortfolioTransferPayload({
          toPortfolioId: destPortfolio.id,
          currencyId: usdCurrency[0].currencyId,
          amount: '-100',
        }),
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('Amount must be a valid number greater than 0'),
    });
  });

  it('should not allow transfer to the same portfolio', async () => {
    // Create portfolio
    const portfolio = await helpers.createPortfolio({ raw: true });

    // Add USD currency to user
    const usdCurrency = await helpers.addUserCurrencies({ currencyCodes: ['USD'] });

    // Try to transfer to the same portfolio
    await expect(
      helpers.createPortfolioTransfer({
        fromPortfolioId: portfolio.id,
        payload: helpers.buildPortfolioTransferPayload({
          toPortfolioId: portfolio.id,
          currencyId: usdCurrency[0].currencyId,
        }),
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('Source and destination portfolios must be different'),
    });
  });
});
