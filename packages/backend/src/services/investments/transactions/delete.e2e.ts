import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { ERROR_CODES } from '@js/errors';
import InvestmentTransaction from '@models/investments/investment-transaction.model';
import type Portfolios from '@models/investments/portfolios.model';
import type Securities from '@models/investments/securities.model';
import UsersCurrencies from '@models/users-currencies.model';
import * as helpers from '@tests/helpers';
import { makeRequest } from '@tests/helpers/common';
import { beforeEach, describe, expect, it } from 'vitest';

describe('DELETE /investments/transaction/:transactionId (delete investment transaction)', () => {
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

    // Create a transaction to delete
    transaction = await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: portfolio.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        quantity: '2',
        price: '50',
      },
      raw: true,
    });
  });

  it('should delete an investment transaction successfully', async () => {
    const response = await helpers.deleteInvestmentTransaction({
      transactionId: transaction.id,
      raw: false,
    });

    expect(response.statusCode).toBe(200);

    // Verify transaction is deleted
    const deletedTransaction = await InvestmentTransaction.findByPk(transaction.id);
    expect(deletedTransaction).toBeNull();
  });

  it('should recalculate holding after transaction deletion', async () => {
    // Get holding before deletion
    const [holdingBefore] = await helpers.getHoldings({
      portfolioId: portfolio.id,
      payload: { securityId: vooSecurity.id },
      raw: true,
    });
    expect(holdingBefore).not.toBeNull();
    expect(holdingBefore!.quantity).toBeNumericEqual(2); // From the buy transaction
    expect(holdingBefore!.costBasis).toBeNumericEqual(100); // 2 * 50

    // Delete the transaction
    await helpers.deleteInvestmentTransaction({
      transactionId: transaction.id,
      raw: false,
    });

    // Get holding after deletion
    const [holdingAfter] = await helpers.getHoldings({
      portfolioId: portfolio.id,
      payload: { securityId: vooSecurity.id },
      raw: true,
    });
    expect(holdingAfter).not.toBeNull();
    expect(holdingAfter!.quantity).toBeNumericEqual(0); // Should be 0 after deletion
    expect(holdingAfter!.costBasis).toBeNumericEqual(0); // Should be 0 after deletion
  });

  it('should handle deleting a transaction that affects multiple transactions', async () => {
    // Create another buy transaction
    await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: portfolio.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        quantity: '3',
        price: '60',
      },
      raw: true,
    });

    // Create a sell transaction
    await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: portfolio.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.sell,
        quantity: '1',
        price: '70',
      },
      raw: true,
    });

    // Verify holding before deletion
    const [holdingBefore] = await helpers.getHoldings({
      portfolioId: portfolio.id,
      payload: { securityId: vooSecurity.id },
      raw: true,
    });
    expect(holdingBefore!.quantity).toBeNumericEqual(4); // 2 + 3 - 1

    // Delete the first buy transaction
    await helpers.deleteInvestmentTransaction({
      transactionId: transaction.id,
      raw: false,
    });

    // Verify holding after deletion - should be recalculated properly
    const [holdingAfter] = await helpers.getHoldings({
      portfolioId: portfolio.id,
      payload: { securityId: vooSecurity.id },
      raw: true,
    });
    expect(holdingAfter!.quantity).toBeNumericEqual(2); // 3 - 1 (first buy deleted)
  });

  it('should successfully delete non-existent transaction', async () => {
    const response = await helpers.deleteInvestmentTransaction({
      transactionId: generateRandomRecordId(),
      raw: false,
    });

    expect(response.statusCode).toBe(200);
  });

  it('should fail with invalid transaction ID', async () => {
    const response = await helpers.deleteInvestmentTransaction({
      transactionId: 'invalid' as unknown as string,
      raw: false,
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  // Regression for MONEY-MATTER-BACKEND-5R: deleting a transaction whose
  // currency was disconnected from the user after creation used to throw
  // `currencyNotConnected` from the downstream ref-amount lookup. The delete
  // path now re-links the currency idempotently before updating the balance.
  it('should delete a transaction even after its currency was disconnected from the user', async () => {
    const [eurSecurity] = await helpers.seedSecurities([{ symbol: 'ASML', name: 'ASML Holding', currencyCode: 'EUR' }]);

    const eurPortfolio = await helpers.createPortfolio({
      payload: helpers.buildPortfolioPayload({ name: 'EUR Portfolio' }),
      raw: true,
    });

    await helpers.createHolding({
      payload: { portfolioId: eurPortfolio.id, securityId: eurSecurity!.id },
    });

    const eurTransaction = await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: eurPortfolio.id,
        securityId: eurSecurity!.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        quantity: '1',
        price: '500',
      },
      raw: true,
    });

    // Simulate the orphan-currency state: user-currency link removed directly
    // (bypassing the API guard, which now blocks this — see deleteUserCurrency).
    await UsersCurrencies.destroy({ where: { currencyCode: 'EUR' } });

    const response = await helpers.deleteInvestmentTransaction({
      transactionId: eurTransaction.id,
      raw: false,
    });

    expect(response.statusCode).toBe(200);

    const deleted = await InvestmentTransaction.findByPk(eurTransaction.id);
    expect(deleted).toBeNull();
  });

  it('should block disconnecting a user currency that is still in use by investment holdings', async () => {
    const [eurSecurity] = await helpers.seedSecurities([{ symbol: 'ASML', name: 'ASML Holding', currencyCode: 'EUR' }]);

    const eurPortfolio = await helpers.createPortfolio({
      payload: helpers.buildPortfolioPayload({ name: 'EUR Portfolio' }),
      raw: true,
    });

    await helpers.createHolding({
      payload: { portfolioId: eurPortfolio.id, securityId: eurSecurity!.id },
    });

    const response = await makeRequest({
      method: 'delete',
      url: '/user/currency',
      payload: { currencyCode: 'EUR' },
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);

    const stillLinked = await UsersCurrencies.findOne({ where: { currencyCode: 'EUR' } });
    expect(stillLinked).not.toBeNull();
  });

  it('should still block currency removal when the holding belongs to a soft-deleted (trashed) portfolio', async () => {
    // Guard for the paranoid:false bypass in user.service.deleteUserCurrency.
    // Without it, a user could remove a currency while a portfolio in trash
    // still references it — restoring the portfolio later would surface broken
    // holding rows with no UsersCurrencies link.
    const [eurSecurity] = await helpers.seedSecurities([{ symbol: 'SAP', name: 'SAP SE', currencyCode: 'EUR' }]);

    const eurPortfolio = await helpers.createPortfolio({
      payload: helpers.buildPortfolioPayload({ name: 'EUR Portfolio Trash' }),
      raw: true,
    });

    await helpers.createHolding({
      payload: { portfolioId: eurPortfolio.id, securityId: eurSecurity!.id },
    });

    await helpers.deletePortfolio({ portfolioId: eurPortfolio.id });

    const response = await makeRequest({
      method: 'delete',
      url: '/user/currency',
      payload: { currencyCode: 'EUR' },
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);

    const stillLinked = await UsersCurrencies.findOne({ where: { currencyCode: 'EUR' } });
    expect(stillLinked).not.toBeNull();
  });
});
