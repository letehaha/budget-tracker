import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { Money } from '@common/types/money';
import { ERROR_CODES } from '@js/errors';
import Holdings from '@models/investments/holdings.model';
import InvestmentTransaction from '@models/investments/investment-transaction.model';
import Portfolios from '@models/investments/portfolios.model';
import Securities from '@models/investments/securities.model';
import * as helpers from '@tests/helpers';
import { beforeEach, describe, expect, it } from 'vitest';

describe('DELETE /investments/holding (delete holding)', () => {
  let investmentPortfolio: Portfolios;
  let vooSecurity: Securities;

  beforeEach(async () => {
    investmentPortfolio = await helpers.createPortfolio({
      payload: helpers.buildPortfolioPayload({
        name: 'Test Investment Portfolio',
      }),
      raw: true,
    });

    // Seed securities and get VOO
    const seededSecurities = await helpers.seedSecurities([{ symbol: 'VOO', name: 'Vanguard S&P 500 ETF' }]);
    const firstSecurity = seededSecurities[0];
    if (!firstSecurity) throw new Error('VOO security not found after seeding');
    vooSecurity = firstSecurity;
  });

  it('should delete a holding successfully', async () => {
    // Create holding first
    await helpers.createHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
      },
    });
    // Delete holding
    const response = await helpers.deleteHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
      },
      raw: false,
    });
    expect(response.statusCode).toBe(200);
  });

  it('should fail to delete a non-existent holding', async () => {
    const response = await helpers.deleteHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id, // never created
      },
      raw: false,
    });
    expect(response.statusCode).toBe(200); // No error, idempotent
  });

  it('should fail to delete holding with non-zero quantity', async () => {
    // Create holding
    await helpers.createHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
      },
    });
    // Manually set quantity to non-zero
    await Holdings.update(
      { quantity: Money.fromDecimal('1.0000000000') },
      { where: { portfolioId: investmentPortfolio.id, securityId: vooSecurity.id } },
    );
    // Try to delete
    const response = await helpers.deleteHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
      },
      raw: false,
    });
    expect(response.statusCode).toBe(ERROR_CODES.NotAllowed);
  });

  it('force-deletes holding with active position and cascades to its transactions', async () => {
    // Seed a second security so we can verify other holdings' transactions are untouched
    const seededSecurities = await helpers.seedSecurities([{ symbol: 'AAPL', name: 'Apple Inc.' }]);
    const aaplSecurity = seededSecurities[0];
    if (!aaplSecurity) throw new Error('AAPL security not found after seeding');

    // Create holdings + transactions for both securities
    await helpers.createHolding({
      payload: { portfolioId: investmentPortfolio.id, securityId: vooSecurity.id },
    });
    await helpers.createHolding({
      payload: { portfolioId: investmentPortfolio.id, securityId: aaplSecurity.id },
    });

    const vooBuy = await helpers.createInvestmentTransaction({
      payload: helpers.buildInvestmentTransactionPayload({
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
        quantity: '10',
        price: '100',
      }),
      raw: true,
    });
    const aaplBuy = await helpers.createInvestmentTransaction({
      payload: helpers.buildInvestmentTransactionPayload({
        portfolioId: investmentPortfolio.id,
        securityId: aaplSecurity.id,
        quantity: '5',
        price: '50',
      }),
      raw: true,
    });

    // Sanity: VOO holding has non-zero quantity now
    const vooHoldingBefore = await Holdings.findOne({
      where: { portfolioId: investmentPortfolio.id, securityId: vooSecurity.id },
    });
    expect(vooHoldingBefore).not.toBeNull();
    expect(vooHoldingBefore!.quantity.isZero()).toBe(false);

    // Force-delete VOO holding (would fail without force due to active position)
    const response = await helpers.deleteHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
        force: true,
      },
      raw: false,
    });
    expect(response.statusCode).toBe(200);

    // VOO holding + all its transactions are gone
    const vooHoldingAfter = await Holdings.findOne({
      where: { portfolioId: investmentPortfolio.id, securityId: vooSecurity.id },
    });
    expect(vooHoldingAfter).toBeNull();
    const vooTxnsAfter = await InvestmentTransaction.findAll({
      where: { portfolioId: investmentPortfolio.id, securityId: vooSecurity.id },
    });
    expect(vooTxnsAfter).toHaveLength(0);

    // AAPL holding + transactions are untouched
    const aaplHoldingAfter = await Holdings.findOne({
      where: { portfolioId: investmentPortfolio.id, securityId: aaplSecurity.id },
    });
    expect(aaplHoldingAfter).not.toBeNull();
    const aaplTxnsAfter = await InvestmentTransaction.findAll({
      where: { portfolioId: investmentPortfolio.id, securityId: aaplSecurity.id },
    });
    expect(aaplTxnsAfter).toHaveLength(1);
    expect(aaplTxnsAfter[0]!.id).toBe(aaplBuy.id);

    // The created VOO transaction is definitely gone (id no longer exists)
    const remainingVooTxn = await InvestmentTransaction.findByPk(vooBuy.id);
    expect(remainingVooTxn).toBeNull();
  });

  it('force-delete restores portfolio cash to pre-purchase state', async () => {
    const currencyCode = vooSecurity.currencyCode;
    await helpers.createHolding({
      payload: { portfolioId: investmentPortfolio.id, securityId: vooSecurity.id },
    });
    await helpers.updatePortfolioBalance({
      portfolioId: investmentPortfolio.id,
      currencyCode,
      setAvailableCash: '10000',
      setTotalCash: '10000',
    });

    await helpers.createInvestmentTransaction({
      payload: helpers.buildInvestmentTransactionPayload({
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        quantity: '10',
        price: '500',
        fees: '5',
      }),
      raw: true,
    });

    const [balanceAfterBuy] = await helpers.getPortfolioBalance({
      portfolioId: investmentPortfolio.id,
      currencyCode,
      raw: true,
    });
    expect(balanceAfterBuy!.availableCash).toBeNumericEqual(4995); // 10000 - (10*500 + 5)
    expect(balanceAfterBuy!.totalCash).toBeNumericEqual(4995);

    await helpers.deleteHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
        force: true,
      },
      raw: false,
    });

    const [balanceAfterDelete] = await helpers.getPortfolioBalance({
      portfolioId: investmentPortfolio.id,
      currencyCode,
      raw: true,
    });
    expect(balanceAfterDelete!.availableCash).toBeNumericEqual(10000);
    expect(balanceAfterDelete!.totalCash).toBeNumericEqual(10000);
  });

  it('force-delete cascades when quantity nets to zero from paired buy + sell', async () => {
    await helpers.createHolding({
      payload: { portfolioId: investmentPortfolio.id, securityId: vooSecurity.id },
    });

    await helpers.createInvestmentTransaction({
      payload: helpers.buildInvestmentTransactionPayload({
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        quantity: '10',
        price: '100',
      }),
      raw: true,
    });
    await helpers.createInvestmentTransaction({
      payload: helpers.buildInvestmentTransactionPayload({
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.sell,
        quantity: '10',
        price: '110',
      }),
      raw: true,
    });

    const holdingBefore = await Holdings.findOne({
      where: { portfolioId: investmentPortfolio.id, securityId: vooSecurity.id },
    });
    expect(holdingBefore!.quantity.isZero()).toBe(true);

    const response = await helpers.deleteHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
        force: true,
      },
      raw: false,
    });
    expect(response.statusCode).toBe(200);

    const holdingAfter = await Holdings.findOne({
      where: { portfolioId: investmentPortfolio.id, securityId: vooSecurity.id },
    });
    expect(holdingAfter).toBeNull();
    const txnsAfter = await InvestmentTransaction.findAll({
      where: { portfolioId: investmentPortfolio.id, securityId: vooSecurity.id },
    });
    expect(txnsAfter).toHaveLength(0);
  });

  it('force-delete is idempotent when holding does not exist', async () => {
    const response = await helpers.deleteHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
        force: true,
      },
      raw: false,
    });
    expect(response.statusCode).toBe(200);
  });

  it('fails if required fields are missing', async () => {
    // Missing portfolioId
    const payloadMissingPortfolioId = { securityId: vooSecurity.id } as unknown as Parameters<
      typeof helpers.deleteHolding
    >[0]['payload'];
    let response = await helpers.deleteHolding({
      payload: payloadMissingPortfolioId,
      raw: false,
    });
    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);

    // Missing securityId
    const payloadMissingSecurityId = { portfolioId: investmentPortfolio.id } as unknown as Parameters<
      typeof helpers.deleteHolding
    >[0]['payload'];
    response = await helpers.deleteHolding({
      payload: payloadMissingSecurityId,
      raw: false,
    });
    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });
});
