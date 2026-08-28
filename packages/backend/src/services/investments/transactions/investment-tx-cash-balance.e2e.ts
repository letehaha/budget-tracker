import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { beforeEach, describe, expect, it } from '@jest/globals';
import Portfolios from '@models/investments/portfolios.model';
import Securities from '@models/investments/securities.model';
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

  describe('Cash balance per transaction category', () => {
    it('applies the right cash delta for every transaction category', async () => {
      const readAvailableCash = async () => {
        const [balance] = await helpers.getPortfolioBalance({
          portfolioId: investmentPortfolio.id,
          currencyCode: holdingCurrencyCode,
          raw: true,
        });
        return balance!;
      };

      const createTx = async ({
        category,
        quantity,
        price,
        fees,
      }: {
        category: INVESTMENT_TRANSACTION_CATEGORY;
        quantity: string;
        price: string;
        fees: string;
      }) => {
        await helpers.createInvestmentTransaction({
          payload: { portfolioId: investmentPortfolio.id, securityId: vooSecurity.id, category, quantity, price, fees },
          raw: true,
        });
      };

      // BUY costs qty*price + fees: 10000 - 1005
      await createTx({ category: INVESTMENT_TRANSACTION_CATEGORY.buy, quantity: '10', price: '100', fees: '5' });
      const afterBuyWithFees = await readAvailableCash();
      expect(afterBuyWithFees.availableCash).toBeNumericEqual(8995);
      expect(afterBuyWithFees.totalCash).toBeNumericEqual(8995);

      // 8995 - 1000
      await createTx({ category: INVESTMENT_TRANSACTION_CATEGORY.buy, quantity: '5', price: '200', fees: '0' });
      expect((await readAvailableCash()).availableCash).toBeNumericEqual(7995);

      // SELL credits qty*price - fees: 7995 + 590
      await createTx({ category: INVESTMENT_TRANSACTION_CATEGORY.sell, quantity: '5', price: '120', fees: '10' });
      expect((await readAvailableCash()).availableCash).toBeNumericEqual(8585);

      // DIVIDEND credits qty*price - fees: 8585 + 17
      await createTx({ category: INVESTMENT_TRANSACTION_CATEGORY.dividend, quantity: '10', price: '2', fees: '3' });
      expect((await readAvailableCash()).availableCash).toBeNumericEqual(8602);

      // FEE debits the whole amount: 8602 - 25
      await createTx({ category: INVESTMENT_TRANSACTION_CATEGORY.fee, quantity: '1', price: '25', fees: '0' });
      expect((await readAvailableCash()).availableCash).toBeNumericEqual(8577);

      // TAX debits the whole amount: 8577 - 50
      await createTx({ category: INVESTMENT_TRANSACTION_CATEGORY.tax, quantity: '1', price: '50', fees: '0' });
      expect((await readAvailableCash()).availableCash).toBeNumericEqual(8527);
    }, 30000);
  });

  describe('SELL validation', () => {
    it('should reject selling from a zero-quantity holding and selling more shares than owned', async () => {
      const fromEmptyHolding = await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: vooSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.sell,
          quantity: '1',
          price: '100',
          fees: '0',
        },
      });

      expect(fromEmptyHolding.statusCode).toBe(422);

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

      const overselling = await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: vooSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.sell,
          quantity: '10',
          price: '120',
          fees: '0',
        },
      });

      expect(overselling.statusCode).toBe(422);
    }, 30000);
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
