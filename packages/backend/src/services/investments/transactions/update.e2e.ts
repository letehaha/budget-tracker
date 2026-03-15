import { TRANSACTION_TYPES } from '@bt/shared/types';
import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { beforeEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@js/errors';
import InvestmentTransaction from '@models/investments/InvestmentTransaction.model';
import Portfolios from '@models/investments/Portfolios.model';
import Securities from '@models/investments/Securities.model';
import * as helpers from '@tests/helpers';

describe('PUT /investments/transaction/:transactionId (update investment transaction)', () => {
  let portfolio: Portfolios;
  let vooSecurity: Securities;
  let transaction: InvestmentTransaction;

  beforeEach(async () => {
    portfolio = await helpers.createPortfolio({
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
        portfolioId: portfolio.id,
        securityId: vooSecurity.id,
      },
    });

    // Create a transaction to update
    transaction = await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: portfolio.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        quantity: '2',
        price: '50',
        fees: '5',
      },
      raw: true,
    });
  });

  it('should update transaction quantity successfully', async () => {
    const response = await helpers.updateInvestmentTransaction({
      transactionId: transaction.id,
      payload: {
        quantity: '3',
      },
      raw: true,
    });

    expect(response.quantity).toBeNumericEqual(3);
    expect(response.amount).toBeNumericEqual(155); // (3 * 50) + 5 fees
    expect(response.price).toBeNumericEqual(50); // Should remain the same
    expect(response.fees).toBeNumericEqual(5); // Should remain the same
  });

  it('should update transaction price successfully', async () => {
    const response = await helpers.updateInvestmentTransaction({
      transactionId: transaction.id,
      payload: {
        price: '60',
      },
      raw: true,
    });

    expect(response.price).toBeNumericEqual(60);
    expect(response.amount).toBeNumericEqual(125); // (2 * 60) + 5 fees
    expect(response.quantity).toBeNumericEqual(2); // Should remain the same
    expect(response.fees).toBeNumericEqual(5); // Should remain the same
  });

  it('should update transaction category successfully', async () => {
    const newTransaction = await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: portfolio.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        quantity: '2',
        price: '50',
        fees: '5',
      },
      raw: true,
    });

    const response = await helpers.updateInvestmentTransaction({
      transactionId: newTransaction.id,
      payload: {
        category: INVESTMENT_TRANSACTION_CATEGORY.sell,
      },
      raw: true,
    });

    expect(response.category).toBe(INVESTMENT_TRANSACTION_CATEGORY.sell);
    // Should change from expense to income, because `transactionType` is about
    // cash flow, and when stocks are `selled`, it means we got income for `cash`
    expect(response.transactionType).toBe(TRANSACTION_TYPES.income);
  });

  it('should update multiple fields successfully', async () => {
    const response = await helpers.updateInvestmentTransaction({
      transactionId: transaction.id,
      payload: {
        quantity: '4',
        price: '75',
        fees: '10',
        name: 'Updated transaction',
      },
      raw: true,
    });

    expect(response.quantity).toBeNumericEqual(4);
    expect(response.price).toBeNumericEqual(75);
    expect(response.fees).toBeNumericEqual(10);
    expect(response.amount).toBeNumericEqual(310); // (4 * 75) + 10 fees
    expect(response.name).toBe('Updated transaction');
  });

  it('should recalculate holding after transaction update', async () => {
    // Get holding before update
    const [holdingBefore] = await helpers.getHoldings({
      portfolioId: portfolio.id,
      payload: { securityId: vooSecurity.id },
      raw: true,
    });
    expect(holdingBefore).not.toBeNull();
    expect(holdingBefore!.quantity).toBeNumericEqual(2); // From the buy transaction
    expect(holdingBefore!.costBasis).toBeNumericEqual(105); // (2 * 50) + 5 fees

    // Update the transaction quantity
    await helpers.updateInvestmentTransaction({
      transactionId: transaction.id,
      payload: {
        quantity: '5',
      },
      raw: true,
    });

    // Get holding after update
    const [holdingAfter] = await helpers.getHoldings({
      portfolioId: portfolio.id,
      payload: { securityId: vooSecurity.id },
      raw: true,
    });
    expect(holdingAfter).not.toBeNull();
    expect(holdingAfter!.quantity).toBeNumericEqual(5); // Should be updated to 5
    expect(holdingAfter!.costBasis).toBeNumericEqual(255); // (5 * 50) + 5 fees
  });

  it('should handle updating date field', async () => {
    const newDate = '2023-01-15';
    const response = await helpers.updateInvestmentTransaction({
      transactionId: transaction.id,
      payload: {
        date: newDate,
      },
      raw: true,
    });

    expect(response.date).toBe(newDate);
  });

  it('should fail to update non-existent transaction', async () => {
    const response = await helpers.updateInvestmentTransaction({
      transactionId: 99999,
      payload: {
        quantity: '3',
      },
      raw: false,
    });

    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('should fail with invalid transaction ID', async () => {
    const response = await helpers.updateInvestmentTransaction({
      transactionId: -1,
      payload: {
        quantity: '3',
      },
      raw: false,
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('should handle empty update payload', async () => {
    const response = await helpers.updateInvestmentTransaction({
      transactionId: transaction.id,
      payload: {},
      raw: true,
    });

    // Should return the transaction unchanged
    expect(response.quantity).toBeNumericEqual(2);
    expect(response.price).toBeNumericEqual(50);
    expect(response.fees).toBeNumericEqual(5);
    expect(response.name).toBe(''); // Empty string since no name was provided during creation
  });

  it('should handle complex scenario with multiple transactions', async () => {
    // Create another buy transaction
    await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: portfolio.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        quantity: '3',
        price: '60',
        fees: '0',
      },
      raw: true,
    });

    // Verify holding before update
    const [holdingBefore] = await helpers.getHoldings({
      portfolioId: portfolio.id,
      payload: { securityId: vooSecurity.id },
      raw: true,
    });
    expect(holdingBefore!.quantity).toBeNumericEqual(5); // 2 + 3

    // Update the first transaction
    await helpers.updateInvestmentTransaction({
      transactionId: transaction.id,
      payload: {
        quantity: '1', // Change from 2 to 1
      },
      raw: true,
    });

    // Verify holding after update
    const [holdingAfter] = await helpers.getHoldings({
      portfolioId: portfolio.id,
      payload: { securityId: vooSecurity.id },
      raw: true,
    });
    expect(holdingAfter!.quantity).toBeNumericEqual(4); // 1 + 3
  });

  describe('Validation Tests', () => {
    it('should fail to update buy transaction to sell with insufficient shares', async () => {
      // We have only 1 buy transaction (2 shares), so converting it to sell should fail
      const response = await helpers.updateInvestmentTransaction({
        transactionId: transaction.id,
        payload: {
          category: INVESTMENT_TRANSACTION_CATEGORY.sell,
        },
        raw: false,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should fail to update sell transaction quantity beyond available shares', async () => {
      // First, create additional shares so we can have a sell transaction
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: portfolio.id,
          securityId: vooSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: '10',
          price: '50',
        },
      });

      // Create a sell transaction
      const sellTransaction = await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: portfolio.id,
          securityId: vooSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.sell,
          quantity: '2',
          price: '55',
        },
        raw: true,
      });

      // Now try to update the sell transaction to sell more than we have
      // We have 12 total shares, selling 2, so 10 remaining. Trying to sell 15 should fail.
      const response = await helpers.updateInvestmentTransaction({
        transactionId: sellTransaction.id,
        payload: {
          quantity: '15',
        },
        raw: false,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should fail to update quantity of buy transaction if changed to sell category simultaneously', async () => {
      // Create another buy transaction so we have more shares
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: portfolio.id,
          securityId: vooSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: '3',
          price: '50',
        },
      });

      // Total shares: 5 (2 + 3)
      // Try to update the first transaction (2 shares) to be a sell of 10 shares
      // After removing the original buy effect, we'd have 3 shares, but trying to sell 10
      const response = await helpers.updateInvestmentTransaction({
        transactionId: transaction.id,
        payload: {
          category: INVESTMENT_TRANSACTION_CATEGORY.sell,
          quantity: '10',
        },
        raw: false,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should successfully update buy transaction to smaller sell when sufficient shares exist', async () => {
      // Create additional shares
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: portfolio.id,
          securityId: vooSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: '10',
          price: '50',
        },
      });

      // Total shares: 12 (2 + 10)
      // Update the first transaction (2 shares buy) to be a sell of 1 share
      // After removing original buy effect: 10 shares remaining, selling 1 should work
      const response = await helpers.updateInvestmentTransaction({
        transactionId: transaction.id,
        payload: {
          category: INVESTMENT_TRANSACTION_CATEGORY.sell,
          quantity: '1',
        },
        raw: true,
      });

      expect(response.category).toBe(INVESTMENT_TRANSACTION_CATEGORY.sell);
      expect(response.quantity).toBeNumericEqual(1);

      // Verify holding calculation is correct
      const [holding] = await helpers.getHoldings({
        portfolioId: portfolio.id,
        payload: { securityId: vooSecurity.id },
        raw: true,
      });
      expect(holding!.quantity).toBeNumericEqual(9); // 10 (from second buy) - 1 (from updated sell)
    });

    it('should fail with negative quantity in update', async () => {
      const response = await helpers.updateInvestmentTransaction({
        transactionId: transaction.id,
        payload: {
          quantity: '-5',
        },
        raw: false,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should fail with negative price in update', async () => {
      const response = await helpers.updateInvestmentTransaction({
        transactionId: transaction.id,
        payload: {
          price: '-100',
        },
        raw: false,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should fail with negative fees in update', async () => {
      const response = await helpers.updateInvestmentTransaction({
        transactionId: transaction.id,
        payload: {
          fees: '-10',
        },
        raw: false,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should handle edge case: updating sell transaction back to buy with same quantity', async () => {
      // Create more shares first
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: portfolio.id,
          securityId: vooSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: '10',
          price: '50',
        },
      });

      // Create a sell transaction
      const sellTransaction = await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: portfolio.id,
          securityId: vooSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.sell,
          quantity: '3',
          price: '60',
        },
        raw: true,
      });

      // Update sell back to buy - should work fine
      const response = await helpers.updateInvestmentTransaction({
        transactionId: sellTransaction.id,
        payload: {
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        },
        raw: true,
      });

      expect(response.category).toBe(INVESTMENT_TRANSACTION_CATEGORY.buy);
      expect(response.transactionType).toBe('expense');

      // Verify holding is recalculated correctly
      const [holding] = await helpers.getHoldings({
        portfolioId: portfolio.id,
        payload: { securityId: vooSecurity.id },
        raw: true,
      });
      expect(holding!.quantity).toBeNumericEqual(15); // 2 + 10 + 3 (all buys now)
    });
  });
});
