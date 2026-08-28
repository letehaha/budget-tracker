import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Exchange Currency', () => {
  it('should exchange currency within a portfolio, auto-creating and accumulating the target balance', async () => {
    const portfolio = await helpers.createPortfolio({
      payload: { name: 'Forex Portfolio', portfolioType: PORTFOLIO_TYPE.investment },
      raw: true,
    });

    const {
      currencies: [eurCurrency, usdCurrency],
    } = await helpers.addUserCurrencies({ currencyCodes: ['EUR', 'USD'], raw: true });

    await helpers.updatePortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode: eurCurrency!.currencyCode,
      setAvailableCash: '2000',
      setTotalCash: '2000',
    });

    const transfer = await helpers.exchangeCurrency({
      portfolioId: portfolio.id,
      payload: helpers.buildExchangeCurrencyPayload({
        fromCurrencyCode: eurCurrency!.currencyCode,
        toCurrencyCode: usdCurrency!.currencyCode,
        fromAmount: '500',
        toAmount: '540',
        description: 'EUR to USD exchange',
      }),
      raw: true,
    });

    expect(transfer).toMatchObject({
      id: expect.any(String),
      fromPortfolioId: portfolio.id,
      toPortfolioId: portfolio.id,
      amount: expect.toBeNumericEqual('500'),
      currencyCode: eurCurrency!.currencyCode,
      toCurrencyCode: usdCurrency!.currencyCode,
      toAmount: expect.toBeNumericEqual('540'),
      description: 'EUR to USD exchange',
    });

    const [eurBalance] = await helpers.getPortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode: eurCurrency!.currencyCode,
      raw: true,
    });
    expect(eurBalance!.availableCash).toBeNumericEqual(1500);
    expect(eurBalance!.totalCash).toBeNumericEqual(1500);

    // The USD balance row is never seeded, so it must be created by the exchange itself.
    const [usdBalance] = await helpers.getPortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode: usdCurrency!.currencyCode,
      raw: true,
    });
    expect(usdBalance!.availableCash).toBeNumericEqual(540);
    expect(usdBalance!.totalCash).toBeNumericEqual(540);

    await helpers.exchangeCurrency({
      portfolioId: portfolio.id,
      payload: helpers.buildExchangeCurrencyPayload({
        fromCurrencyCode: eurCurrency!.currencyCode,
        toCurrencyCode: usdCurrency!.currencyCode,
        fromAmount: '200',
        toAmount: '216',
      }),
      raw: true,
    });

    const [eurBalanceAfter] = await helpers.getPortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode: eurCurrency!.currencyCode,
      raw: true,
    });
    expect(eurBalanceAfter!.availableCash).toBeNumericEqual(1300);
    expect(eurBalanceAfter!.totalCash).toBeNumericEqual(1300);

    const [usdBalanceAfter] = await helpers.getPortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode: usdCurrency!.currencyCode,
      raw: true,
    });
    expect(usdBalanceAfter!.availableCash).toBeNumericEqual(756);
    expect(usdBalanceAfter!.totalCash).toBeNumericEqual(756);
  }, 30000);

  it('should allow negative balance (margin)', async () => {
    const portfolio = await helpers.createPortfolio({ raw: true });

    const {
      currencies: [eurCurrency, usdCurrency],
    } = await helpers.addUserCurrencies({ currencyCodes: ['EUR', 'USD'], raw: true });

    // No EUR balance seeded — exchange should still work (goes negative)
    const transfer = await helpers.exchangeCurrency({
      portfolioId: portfolio.id,
      payload: helpers.buildExchangeCurrencyPayload({
        fromCurrencyCode: eurCurrency!.currencyCode,
        toCurrencyCode: usdCurrency!.currencyCode,
        fromAmount: '100',
        toAmount: '108',
      }),
      raw: true,
    });

    expect(transfer.id).toBeDefined();

    const [eurBalance] = await helpers.getPortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode: eurCurrency!.currencyCode,
      raw: true,
    });
    expect(eurBalance!.availableCash).toBeNumericEqual(-100);
    expect(eurBalance!.totalCash).toBeNumericEqual(-100);
  });

  it('should reject same from/to currency, zero or negative amounts, unknown currency codes and an unknown portfolio', async () => {
    const portfolio = await helpers.createPortfolio({ raw: true });

    const {
      currencies: [eurCurrency, usdCurrency],
    } = await helpers.addUserCurrencies({ currencyCodes: ['EUR', 'USD'], raw: true });

    const sameCurrency = await helpers.exchangeCurrency({
      portfolioId: portfolio.id,
      payload: helpers.buildExchangeCurrencyPayload({
        fromCurrencyCode: usdCurrency!.currencyCode,
        toCurrencyCode: usdCurrency!.currencyCode,
        fromAmount: '100',
        toAmount: '100',
      }),
    });
    expect(sameCurrency.statusCode).toBe(ERROR_CODES.ValidationError);

    const zeroFromAmount = await helpers.exchangeCurrency({
      portfolioId: portfolio.id,
      payload: helpers.buildExchangeCurrencyPayload({
        fromCurrencyCode: eurCurrency!.currencyCode,
        toCurrencyCode: usdCurrency!.currencyCode,
        fromAmount: '0',
        toAmount: '100',
      }),
    });
    expect(zeroFromAmount.statusCode).toBe(ERROR_CODES.ValidationError);

    const negativeFromAmount = await helpers.exchangeCurrency({
      portfolioId: portfolio.id,
      payload: helpers.buildExchangeCurrencyPayload({
        fromCurrencyCode: eurCurrency!.currencyCode,
        toCurrencyCode: usdCurrency!.currencyCode,
        fromAmount: '-500',
        toAmount: '100',
      }),
    });
    expect(negativeFromAmount.statusCode).toBe(ERROR_CODES.ValidationError);

    const negativeToAmount = await helpers.exchangeCurrency({
      portfolioId: portfolio.id,
      payload: helpers.buildExchangeCurrencyPayload({
        fromCurrencyCode: eurCurrency!.currencyCode,
        toCurrencyCode: usdCurrency!.currencyCode,
        fromAmount: '100',
        toAmount: '-50',
      }),
    });
    expect(negativeToAmount.statusCode).toBe(ERROR_CODES.ValidationError);

    const unknownFromCurrency = await helpers.exchangeCurrency({
      portfolioId: portfolio.id,
      payload: helpers.buildExchangeCurrencyPayload({
        fromCurrencyCode: 'ZZZ',
        toCurrencyCode: eurCurrency!.currencyCode,
        fromAmount: '100',
        toAmount: '100',
      }),
    });
    expect(unknownFromCurrency.statusCode).toBe(ERROR_CODES.ValidationError);

    const unknownToCurrency = await helpers.exchangeCurrency({
      portfolioId: portfolio.id,
      payload: helpers.buildExchangeCurrencyPayload({
        fromCurrencyCode: eurCurrency!.currencyCode,
        toCurrencyCode: 'ZZZ',
        fromAmount: '100',
        toAmount: '100',
      }),
    });
    expect(unknownToCurrency.statusCode).toBe(ERROR_CODES.ValidationError);

    const unknownPortfolio = await helpers.exchangeCurrency({
      portfolioId: generateRandomRecordId(),
      payload: helpers.buildExchangeCurrencyPayload({
        fromCurrencyCode: eurCurrency!.currencyCode,
        toCurrencyCode: usdCurrency!.currencyCode,
      }),
    });
    expect(unknownPortfolio.statusCode).toBe(ERROR_CODES.NotFoundError);
  }, 30000);

  it('should handle decimal precision amounts correctly', async () => {
    const portfolio = await helpers.createPortfolio({ raw: true });

    const {
      currencies: [eurCurrency, usdCurrency],
    } = await helpers.addUserCurrencies({ currencyCodes: ['EUR', 'USD'], raw: true });

    await helpers.updatePortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode: eurCurrency!.currencyCode,
      setAvailableCash: '1000',
      setTotalCash: '1000',
    });

    // Exchange with fractional amounts
    const transfer = await helpers.exchangeCurrency({
      portfolioId: portfolio.id,
      payload: helpers.buildExchangeCurrencyPayload({
        fromCurrencyCode: eurCurrency!.currencyCode,
        toCurrencyCode: usdCurrency!.currencyCode,
        fromAmount: '123.45',
        toAmount: '132.1234',
      }),
      raw: true,
    });

    expect(transfer.amount).toBeNumericEqual('123.45');
    expect(transfer.toAmount).toBeNumericEqual('132.1234');

    const [eurBalance] = await helpers.getPortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode: eurCurrency!.currencyCode,
      raw: true,
    });
    expect(eurBalance!.availableCash).toBeNumericEqual(876.55);

    const [usdBalance] = await helpers.getPortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode: usdCurrency!.currencyCode,
      raw: true,
    });
    expect(usdBalance!.availableCash).toBeNumericEqual(132.1234);
  });

  it('should appear in listPortfolioTransfers with toCurrency populated', async () => {
    const portfolio = await helpers.createPortfolio({ raw: true });

    const {
      currencies: [eurCurrency, usdCurrency],
    } = await helpers.addUserCurrencies({ currencyCodes: ['EUR', 'USD'], raw: true });

    await helpers.exchangeCurrency({
      portfolioId: portfolio.id,
      payload: helpers.buildExchangeCurrencyPayload({
        fromCurrencyCode: eurCurrency!.currencyCode,
        toCurrencyCode: usdCurrency!.currencyCode,
        fromAmount: '100',
        toAmount: '108',
      }),
      raw: true,
    });

    const { data: transfers } = await helpers.listPortfolioTransfers({
      portfolioId: portfolio.id,
      raw: true,
    });

    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toMatchObject({
      currencyCode: eurCurrency!.currencyCode,
      toCurrencyCode: usdCurrency!.currencyCode,
      amount: expect.toBeNumericEqual('100'),
      toAmount: expect.toBeNumericEqual('108'),
    });
    expect(transfers[0]!.currency).toBeDefined();
    expect(transfers[0]!.toCurrency).toBeDefined();
    expect(transfers[0]!.toCurrency!.code).toBe(usdCurrency!.currencyCode);
  });

  it('should reverse balances when exchange is deleted', async () => {
    const portfolio = await helpers.createPortfolio({ raw: true });

    const {
      currencies: [eurCurrency, usdCurrency],
    } = await helpers.addUserCurrencies({ currencyCodes: ['EUR', 'USD'], raw: true });

    await helpers.updatePortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode: eurCurrency!.currencyCode,
      setAvailableCash: '1000',
      setTotalCash: '1000',
    });

    // Create exchange
    const transfer = await helpers.exchangeCurrency({
      portfolioId: portfolio.id,
      payload: helpers.buildExchangeCurrencyPayload({
        fromCurrencyCode: eurCurrency!.currencyCode,
        toCurrencyCode: usdCurrency!.currencyCode,
        fromAmount: '500',
        toAmount: '540',
      }),
      raw: true,
    });

    // Delete exchange
    await helpers.deletePortfolioTransfer({
      portfolioId: portfolio.id,
      transferId: transfer.id,
      raw: true,
    });

    // EUR balance should be restored
    const [eurBalance] = await helpers.getPortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode: eurCurrency!.currencyCode,
      raw: true,
    });
    expect(eurBalance!.availableCash).toBeNumericEqual(1000);
    expect(eurBalance!.totalCash).toBeNumericEqual(1000);

    // USD balance should be reversed (was 540, now 0)
    const [usdBalance] = await helpers.getPortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode: usdCurrency!.currencyCode,
      raw: true,
    });
    expect(usdBalance!.availableCash).toBeNumericEqual(0);
    expect(usdBalance!.totalCash).toBeNumericEqual(0);
  });
});
