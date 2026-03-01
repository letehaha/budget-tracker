import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { beforeEach, describe, expect, it } from '@jest/globals';
import Portfolios from '@models/investments/Portfolios.model';
import Securities from '@models/investments/Securities.model';
import * as helpers from '@tests/helpers';

describe('Investment Transaction Cash Balance Updates', () => {
  let investmentPortfolio: Portfolios;
  let vooSecurity: Securities;
  let holdingCurrencyCode: string;

  beforeEach(async () => {
    investmentPortfolio = await helpers.createPortfolio({
      payload: helpers.buildPortfolioPayload({ name: 'Cash Test Portfolio' }),
      raw: true,
    });

    const seededSecurities = await helpers.seedSecurities([{ symbol: 'VOO', name: 'Vanguard S&P 500 ETF' }]);
    vooSecurity = seededSecurities.find((s) => s.symbol === 'VOO')!;
    if (!vooSecurity) throw new Error('VOO security not found after seeding');

    holdingCurrencyCode = vooSecurity.currencyCode;

    await helpers.createHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
      },
    });

    // Seed portfolio with initial cash balance
    await helpers.updatePortfolioBalance({
      portfolioId: investmentPortfolio.id,
      currencyCode: holdingCurrencyCode,
      setAvailableCash: '10000',
      setTotalCash: '10000',
    });
  });

  describe('BUY transactions', () => {
    it('should decrease cash balance on BUY (qty*price + fees)', async () => {
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: vooSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: '10',
          price: '100',
          fees: '5',
        },
        raw: true,
      });

      // Cash should decrease by: 10*100 + 5 = 1005
      const [balance] = await helpers.getPortfolioBalance({
        portfolioId: investmentPortfolio.id,
        currencyCode: holdingCurrencyCode,
        raw: true,
      });

      expect(balance!.availableCash).toBeNumericEqual(8995); // 10000 - 1005
      expect(balance!.totalCash).toBeNumericEqual(8995);
    });

    it('should decrease cash with zero fees', async () => {
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: vooSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: '5',
          price: '200',
          fees: '0',
        },
        raw: true,
      });

      // Cash should decrease by: 5*200 + 0 = 1000
      const [balance] = await helpers.getPortfolioBalance({
        portfolioId: investmentPortfolio.id,
        currencyCode: holdingCurrencyCode,
        raw: true,
      });

      expect(balance!.availableCash).toBeNumericEqual(9000);
    });
  });

  describe('SELL transactions', () => {
    it('should increase cash balance on SELL (qty*price - fees)', async () => {
      // First buy some shares
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: vooSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: '10',
          price: '100',
          fees: '0',
        },
        raw: true,
      });

      // Cash after buy: 10000 - 1000 = 9000
      // Now sell
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: vooSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.sell,
          quantity: '5',
          price: '120',
          fees: '10',
        },
        raw: true,
      });

      // Cash should increase by: 5*120 - 10 = 590
      // Total: 9000 + 590 = 9590
      const [balance] = await helpers.getPortfolioBalance({
        portfolioId: investmentPortfolio.id,
        currencyCode: holdingCurrencyCode,
        raw: true,
      });

      expect(balance!.availableCash).toBeNumericEqual(9590);
    });
  });

  describe('DIVIDEND transactions', () => {
    it('should increase cash balance on DIVIDEND (qty*price - fees)', async () => {
      // Buy first so holding exists
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: vooSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: '10',
          price: '100',
          fees: '0',
        },
        raw: true,
      });

      // Cash after buy: 10000 - 1000 = 9000
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: vooSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.dividend,
          quantity: '10',
          price: '2',
          fees: '3',
        },
        raw: true,
      });

      // Cash should increase by: 10*2 - 3 = 17
      // Total: 9000 + 17 = 9017
      const [balance] = await helpers.getPortfolioBalance({
        portfolioId: investmentPortfolio.id,
        currencyCode: holdingCurrencyCode,
        raw: true,
      });

      expect(balance!.availableCash).toBeNumericEqual(9017);
    });
  });

  describe('FEE transactions', () => {
    it('should decrease cash balance on FEE', async () => {
      // Buy first
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: vooSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: '10',
          price: '100',
          fees: '0',
        },
        raw: true,
      });

      // Cash after buy: 9000
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: vooSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.fee,
          quantity: '1',
          price: '25',
          fees: '0',
        },
        raw: true,
      });

      // FEE delta = -amount = -(1*25 + 0) = -25
      // Total: 9000 - 25 = 8975
      const [balance] = await helpers.getPortfolioBalance({
        portfolioId: investmentPortfolio.id,
        currencyCode: holdingCurrencyCode,
        raw: true,
      });

      expect(balance!.availableCash).toBeNumericEqual(8975);
    });
  });

  describe('TAX transactions', () => {
    it('should decrease cash balance on TAX', async () => {
      // Buy first so holding exists
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: vooSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: '10',
          price: '100',
          fees: '0',
        },
        raw: true,
      });

      // Cash after buy: 10000 - 1000 = 9000
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: vooSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.tax,
          quantity: '1',
          price: '50',
          fees: '0',
        },
        raw: true,
      });

      // TAX delta = -amount = -(1*50 + 0) = -50
      // Total: 9000 - 50 = 8950
      const [balance] = await helpers.getPortfolioBalance({
        portfolioId: investmentPortfolio.id,
        currencyCode: holdingCurrencyCode,
        raw: true,
      });

      expect(balance!.availableCash).toBeNumericEqual(8950);
    });
  });

  describe('SELL validation', () => {
    it('should reject selling more shares than currently owned', async () => {
      // Buy 5 shares
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: vooSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: '5',
          price: '100',
          fees: '0',
        },
        raw: true,
      });

      // Try to sell 10 shares (more than the 5 owned)
      const response = await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: vooSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.sell,
          quantity: '10',
          price: '120',
          fees: '0',
        },
      });

      expect(response.statusCode).toBe(422);
    });

    it('should reject selling from zero-quantity holding', async () => {
      // No buy transactions — holding quantity is 0
      const response = await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: vooSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.sell,
          quantity: '1',
          price: '100',
          fees: '0',
        },
      });

      expect(response.statusCode).toBe(422);
    });
  });

  describe('Delete transaction reverses cash', () => {
    it('should restore cash when deleting a BUY transaction', async () => {
      const response = await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: vooSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: '10',
          price: '100',
          fees: '5',
        },
      });

      const transaction = helpers.extractResponse(response);

      // Cash: 10000 - 1005 = 8995
      const [balanceBefore] = await helpers.getPortfolioBalance({
        portfolioId: investmentPortfolio.id,
        currencyCode: holdingCurrencyCode,
        raw: true,
      });
      expect(balanceBefore!.availableCash).toBeNumericEqual(8995);

      // Delete the transaction
      await helpers.deleteInvestmentTransaction({
        transactionId: transaction.id,
        raw: true,
      });

      // Cash should be restored to 10000
      const [balanceAfter] = await helpers.getPortfolioBalance({
        portfolioId: investmentPortfolio.id,
        currencyCode: holdingCurrencyCode,
        raw: true,
      });
      expect(balanceAfter!.availableCash).toBeNumericEqual(10000);
    });

    it('should restore cash when deleting a SELL transaction', async () => {
      // Buy first
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: vooSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: '10',
          price: '100',
          fees: '0',
        },
        raw: true,
      });

      // Cash: 10000 - 1000 = 9000
      const sellResponse = await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: vooSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.sell,
          quantity: '5',
          price: '120',
          fees: '0',
        },
      });

      const sellTx = helpers.extractResponse(sellResponse);

      // Cash: 9000 + 600 = 9600
      const [balanceBefore] = await helpers.getPortfolioBalance({
        portfolioId: investmentPortfolio.id,
        currencyCode: holdingCurrencyCode,
        raw: true,
      });
      expect(balanceBefore!.availableCash).toBeNumericEqual(9600);

      // Delete the sell transaction
      await helpers.deleteInvestmentTransaction({
        transactionId: sellTx.id,
        raw: true,
      });

      // Cash should be back to 9000
      const [balanceAfter] = await helpers.getPortfolioBalance({
        portfolioId: investmentPortfolio.id,
        currencyCode: holdingCurrencyCode,
        raw: true,
      });
      expect(balanceAfter!.availableCash).toBeNumericEqual(9000);
    });
  });

  describe('Full round-trip', () => {
    it('should handle deposit → buy → sell → withdraw cycle', async () => {
      // Create an account in the SAME currency as the holding (USD),
      // so that the deposit lands in the same balance bucket as buy/sell
      const { account } = await helpers.createAccountWithNewCurrency({ currency: holdingCurrencyCode });

      // Reset portfolio balance to 0
      await helpers.updatePortfolioBalance({
        portfolioId: investmentPortfolio.id,
        currencyCode: holdingCurrencyCode,
        setAvailableCash: '0',
        setTotalCash: '0',
      });

      // 1. Deposit cash into portfolio from account
      await helpers.accountToPortfolioTransfer({
        portfolioId: investmentPortfolio.id,
        payload: {
          accountId: account.id,
          amount: '5000',
          date: '2025-01-01',
        },
        raw: true,
      });

      const [afterDeposit] = await helpers.getPortfolioBalance({
        portfolioId: investmentPortfolio.id,
        currencyCode: holdingCurrencyCode,
        raw: true,
      });
      expect(afterDeposit!.availableCash).toBeNumericEqual(5000);

      // 2. Buy holdings (cash decreases)
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: vooSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: '10',
          price: '400',
          fees: '10',
        },
        raw: true,
      });

      // Cash: 5000 - (10*400 + 10) = 5000 - 4010 = 990
      const [afterBuy] = await helpers.getPortfolioBalance({
        portfolioId: investmentPortfolio.id,
        currencyCode: holdingCurrencyCode,
        raw: true,
      });
      expect(afterBuy!.availableCash).toBeNumericEqual(990);

      // 3. Sell holdings (cash increases)
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: vooSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.sell,
          quantity: '5',
          price: '450',
          fees: '10',
        },
        raw: true,
      });

      // Cash: 990 + (5*450 - 10) = 990 + 2240 = 3230
      const [afterSell] = await helpers.getPortfolioBalance({
        portfolioId: investmentPortfolio.id,
        currencyCode: holdingCurrencyCode,
        raw: true,
      });
      expect(afterSell!.availableCash).toBeNumericEqual(3230);

      // 4. Withdraw cash back to account
      await helpers.portfolioToAccountTransfer({
        portfolioId: investmentPortfolio.id,
        payload: {
          accountId: account.id,
          amount: '2000',
          currencyCode: holdingCurrencyCode,
          date: '2025-06-01',
        },
        raw: true,
      });

      // Cash: 3230 - 2000 = 1230
      const [afterWithdraw] = await helpers.getPortfolioBalance({
        portfolioId: investmentPortfolio.id,
        currencyCode: holdingCurrencyCode,
        raw: true,
      });
      expect(afterWithdraw!.availableCash).toBeNumericEqual(1230);
    });
  });
});
