import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import Portfolios from '@models/investments/Portfolios.model';
import Securities from '@models/investments/Securities.model';
import * as helpers from '@tests/helpers';

describe('POST /transaction (create investment transaction)', () => {
  let investmentPortfolio: Portfolios;
  let vooSecurity: Securities;

  beforeEach(async () => {
    investmentPortfolio = await helpers.createPortfolio({
      payload: helpers.buildPortfolioPayload({
        name: 'Test Investment Portfolio',
      }),
      raw: true,
    });

    const seededSecurities: Securities[] = await helpers.seedSecurities([
      { symbol: 'VOO', name: 'Vanguard S&P 500 ETF' },
    ]);
    vooSecurity = seededSecurities.find((s) => s.symbol === 'VOO')!;
    if (!vooSecurity) throw new Error('VOO security not found after seeding');

    await helpers.createHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
      },
    });
  });

  it('should create a buy transaction successfully', async () => {
    const response = await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        quantity: '2',
        price: '50',
      },
    });

    expect(response.statusCode).toBe(201);
    const transaction = helpers.extractResponse(response);
    expect(transaction.portfolioId).toBe(investmentPortfolio.id);
    expect(transaction.securityId).toBe(vooSecurity.id);
    expect(transaction.category).toBe(INVESTMENT_TRANSACTION_CATEGORY.buy);
    expect(transaction.quantity).toBeNumericEqual(2);
    expect(transaction.price).toBeNumericEqual(50);

    // Verify holding was updated
    const [holding] = await helpers.getHoldings({
      portfolioId: investmentPortfolio.id,
      payload: { securityId: vooSecurity.id },
      raw: true,
    });
    expect(holding).toBeTruthy();
    expect(holding!.quantity).toBeNumericEqual(2);
    expect(holding!.costBasis).toBeNumericEqual(100);
  });

  it('should create a sell transaction successfully', async () => {
    // First create a buy transaction to have shares to sell
    await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        quantity: '5',
        price: '40',
      },
    });

    // Now create the sell transaction
    const response = await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.sell,
        quantity: '2',
        price: '50',
      },
    });

    expect(response.statusCode).toBe(201);
    const transaction = helpers.extractResponse(response);
    expect(transaction.portfolioId).toBe(investmentPortfolio.id);
    expect(transaction.securityId).toBe(vooSecurity.id);
    expect(transaction.category).toBe(INVESTMENT_TRANSACTION_CATEGORY.sell);
    expect(transaction.quantity).toBeNumericEqual(2);
    expect(transaction.price).toBeNumericEqual(50);

    // Verify holding was updated
    const [holding] = await helpers.getHoldings({
      portfolioId: investmentPortfolio.id,
      payload: { securityId: vooSecurity.id },
      raw: true,
    });
    expect(holding).toBeTruthy();
    expect(holding!.quantity).toBeNumericEqual(3);
    expect(holding!.costBasis).toBeNumericEqual(120);
  });

  it('should fail to create a sell transaction with insufficient shares', async () => {
    const response = await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.sell,
        quantity: '1',
        price: '50',
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('should fail to create a transaction for non-existent portfolio', async () => {
    const response = await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: 999999,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        quantity: '1',
        price: '50',
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('should fail to create a transaction for non-existent security', async () => {
    const response = await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: 999999,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        quantity: '1',
        price: '50',
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('should fail to create a transaction with invalid quantity', async () => {
    const response = await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        quantity: '-1',
        price: '50',
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('should fail to create a transaction with invalid price', async () => {
    const response = await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        quantity: '1',
        price: '-50',
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });
});
