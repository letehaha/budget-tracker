import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Exchange Currency', () => {
  it('should exchange currency within a portfolio', async () => {
    const portfolio = await helpers.createPortfolio({
      payload: { name: 'Forex Portfolio', portfolioType: PORTFOLIO_TYPE.investment },
      raw: true,
    });

    const {
      currencies: [eurCurrency, usdCurrency],
    } = await helpers.addUserCurrencies({ currencyCodes: ['EUR', 'USD'], raw: true });

    // Seed EUR balance
    await helpers.updatePortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode: eurCurrency!.currencyCode,
      setAvailableCash: '1000',
      setTotalCash: '1000',
    });

    // Exchange 500 EUR -> 540 USD
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
      id: expect.any(Number),
      fromPortfolioId: portfolio.id,
      toPortfolioId: portfolio.id,
      amount: expect.toBeNumericEqual('500'),
      currencyCode: eurCurrency!.currencyCode,
      toCurrencyCode: usdCurrency!.currencyCode,
      toAmount: expect.toBeNumericEqual('540'),
      description: 'EUR to USD exchange',
    });

    // Verify EUR balance decreased
    const [eurBalance] = await helpers.getPortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode: eurCurrency!.currencyCode,
      raw: true,
    });
    expect(eurBalance!.availableCash).toBeNumericEqual(500);
    expect(eurBalance!.totalCash).toBeNumericEqual(500);

    // Verify USD balance was created and has correct amount
    const [usdBalance] = await helpers.getPortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode: usdCurrency!.currencyCode,
      raw: true,
    });
    expect(usdBalance!.availableCash).toBeNumericEqual(540);
    expect(usdBalance!.totalCash).toBeNumericEqual(540);
  });

  it('should auto-create target currency balance if it does not exist', async () => {
    const portfolio = await helpers.createPortfolio({ raw: true });

    const {
      currencies: [gbpCurrency, jpyCurrency],
    } = await helpers.addUserCurrencies({ currencyCodes: ['GBP', 'JPY'], raw: true });

    // Seed GBP balance
    await helpers.updatePortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode: gbpCurrency!.currencyCode,
      setAvailableCash: '2000',
      setTotalCash: '2000',
    });

    // Exchange GBP -> JPY (JPY balance does not exist yet)
    await helpers.exchangeCurrency({
      portfolioId: portfolio.id,
      payload: helpers.buildExchangeCurrencyPayload({
        fromCurrencyCode: gbpCurrency!.currencyCode,
        toCurrencyCode: jpyCurrency!.currencyCode,
        fromAmount: '100',
        toAmount: '18500',
      }),
      raw: true,
    });

    const [jpyBalance] = await helpers.getPortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode: jpyCurrency!.currencyCode,
      raw: true,
    });
    expect(jpyBalance!.availableCash).toBeNumericEqual(18500);
    expect(jpyBalance!.totalCash).toBeNumericEqual(18500);
  });

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

  it('should reject exchange with same from and to currency', async () => {
    const portfolio = await helpers.createPortfolio({ raw: true });

    const {
      currencies: [usdCurrency],
    } = await helpers.addUserCurrencies({ currencyCodes: ['USD'], raw: true });

    const response = await helpers.exchangeCurrency({
      portfolioId: portfolio.id,
      payload: helpers.buildExchangeCurrencyPayload({
        fromCurrencyCode: usdCurrency!.currencyCode,
        toCurrencyCode: usdCurrency!.currencyCode,
        fromAmount: '100',
        toAmount: '100',
      }),
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('should reject zero or negative amounts', async () => {
    const portfolio = await helpers.createPortfolio({ raw: true });

    const {
      currencies: [eurCurrency, usdCurrency],
    } = await helpers.addUserCurrencies({ currencyCodes: ['EUR', 'USD'], raw: true });

    // Zero fromAmount
    const zeroResponse = await helpers.exchangeCurrency({
      portfolioId: portfolio.id,
      payload: helpers.buildExchangeCurrencyPayload({
        fromCurrencyCode: eurCurrency!.currencyCode,
        toCurrencyCode: usdCurrency!.currencyCode,
        fromAmount: '0',
        toAmount: '100',
      }),
    });
    expect(zeroResponse.statusCode).toBe(ERROR_CODES.ValidationError);

    // Negative fromAmount
    const negativeFromResponse = await helpers.exchangeCurrency({
      portfolioId: portfolio.id,
      payload: helpers.buildExchangeCurrencyPayload({
        fromCurrencyCode: eurCurrency!.currencyCode,
        toCurrencyCode: usdCurrency!.currencyCode,
        fromAmount: '-500',
        toAmount: '100',
      }),
    });
    expect(negativeFromResponse.statusCode).toBe(ERROR_CODES.ValidationError);

    // Negative toAmount
    const negativeResponse = await helpers.exchangeCurrency({
      portfolioId: portfolio.id,
      payload: helpers.buildExchangeCurrencyPayload({
        fromCurrencyCode: eurCurrency!.currencyCode,
        toCurrencyCode: usdCurrency!.currencyCode,
        fromAmount: '100',
        toAmount: '-50',
      }),
    });
    expect(negativeResponse.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('should reject exchange with non-existent currency codes', async () => {
    const portfolio = await helpers.createPortfolio({ raw: true });

    const {
      currencies: [eurCurrency],
    } = await helpers.addUserCurrencies({ currencyCodes: ['EUR'], raw: true });

    // Non-existent fromCurrencyCode
    const badFromResponse = await helpers.exchangeCurrency({
      portfolioId: portfolio.id,
      payload: helpers.buildExchangeCurrencyPayload({
        fromCurrencyCode: 'ZZZ',
        toCurrencyCode: eurCurrency!.currencyCode,
        fromAmount: '100',
        toAmount: '100',
      }),
    });
    expect(badFromResponse.statusCode).toBe(ERROR_CODES.NotFoundError);

    // Non-existent toCurrencyCode
    const badToResponse = await helpers.exchangeCurrency({
      portfolioId: portfolio.id,
      payload: helpers.buildExchangeCurrencyPayload({
        fromCurrencyCode: eurCurrency!.currencyCode,
        toCurrencyCode: 'ZZZ',
        fromAmount: '100',
        toAmount: '100',
      }),
    });
    expect(badToResponse.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('should accumulate balances correctly across multiple sequential exchanges', async () => {
    const portfolio = await helpers.createPortfolio({ raw: true });

    const {
      currencies: [eurCurrency, usdCurrency],
    } = await helpers.addUserCurrencies({ currencyCodes: ['EUR', 'USD'], raw: true });

    await helpers.updatePortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode: eurCurrency!.currencyCode,
      setAvailableCash: '2000',
      setTotalCash: '2000',
    });

    // First exchange: 500 EUR -> 540 USD
    await helpers.exchangeCurrency({
      portfolioId: portfolio.id,
      payload: helpers.buildExchangeCurrencyPayload({
        fromCurrencyCode: eurCurrency!.currencyCode,
        toCurrencyCode: usdCurrency!.currencyCode,
        fromAmount: '500',
        toAmount: '540',
      }),
      raw: true,
    });

    // Second exchange: 200 EUR -> 216 USD
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

    // EUR: 2000 - 500 - 200 = 1300
    const [eurBalance] = await helpers.getPortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode: eurCurrency!.currencyCode,
      raw: true,
    });
    expect(eurBalance!.availableCash).toBeNumericEqual(1300);
    expect(eurBalance!.totalCash).toBeNumericEqual(1300);

    // USD: 540 + 216 = 756
    const [usdBalance] = await helpers.getPortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode: usdCurrency!.currencyCode,
      raw: true,
    });
    expect(usdBalance!.availableCash).toBeNumericEqual(756);
    expect(usdBalance!.totalCash).toBeNumericEqual(756);
  });

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

  it('should reject exchange for non-existent portfolio', async () => {
    const {
      currencies: [eurCurrency, usdCurrency],
    } = await helpers.addUserCurrencies({ currencyCodes: ['EUR', 'USD'], raw: true });

    const response = await helpers.exchangeCurrency({
      portfolioId: 999999,
      payload: helpers.buildExchangeCurrencyPayload({
        fromCurrencyCode: eurCurrency!.currencyCode,
        toCurrencyCode: usdCurrency!.currencyCode,
      }),
    });

    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
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
