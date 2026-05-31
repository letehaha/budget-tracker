import { ACCOUNT_CATEGORIES } from '@bt/shared/types';
import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { Money } from '@common/types/money';
import { ERROR_CODES } from '@js/errors';
import Holdings from '@models/investments/holdings.model';
import InvestmentTransaction from '@models/investments/investment-transaction.model';
import PortfolioBalances from '@models/investments/portfolio-balances.model';
import Portfolios from '@models/investments/portfolios.model';
import * as helpers from '@tests/helpers';
import { describe, expect, it } from 'vitest';

describe('Delete Portfolio Service E2E', () => {
  describe('DELETE /investments/portfolios/:id', () => {
    describe('Soft delete (default)', () => {
      it('should soft-delete an empty portfolio', async () => {
        const created = await helpers.createPortfolio({ raw: true });

        const deleteResponse = await helpers.deletePortfolio({ portfolioId: created.id });
        expect(deleteResponse.statusCode).toBe(200);

        // Portfolio disappears from default list (paranoid filtering)
        const list = await helpers.listPortfolios({ raw: true });
        expect(list.data.find((p) => p.id === created.id)).toBeUndefined();

        // GET on the soft-deleted portfolio returns 404
        const getResponse = await helpers.getPortfolio({ portfolioId: created.id });
        expect(getResponse.statusCode).toBe(ERROR_CODES.NotFoundError);
      });

      it('should soft-delete a portfolio with holdings, balances, and transactions', async () => {
        const created = await helpers.createPortfolio({ raw: true });

        const usdCurrency = global.MODELS_CURRENCIES!.find((c: { code: string }) => c.code === 'USD');
        const currencyToUse = usdCurrency || global.BASE_CURRENCY;

        const investmentAccount = await helpers.createAccount({
          payload: helpers.buildAccountPayload({
            accountCategory: ACCOUNT_CATEGORIES.investment,
            currencyCode: currencyToUse.code,
          }),
          raw: true,
        });

        const [vooSecurity] = await helpers.seedSecurities([{ symbol: 'VOO', name: 'Vanguard S&P 500 ETF' }]);

        await Holdings.create({
          portfolioId: created.id,
          securityId: vooSecurity!.id,
          quantity: Money.zero(),
          costBasis: Money.zero(),
          refCostBasis: Money.zero(),
          currencyCode: 'USD',
        });

        await helpers.createInvestmentTransaction({
          payload: {
            portfolioId: created.id,
            securityId: vooSecurity!.id,
            category: INVESTMENT_TRANSACTION_CATEGORY.buy,
            quantity: '10',
            price: '100',
            fees: '5',
          },
        });

        await helpers.updatePortfolioBalance({
          portfolioId: created.id,
          currencyCode: global.BASE_CURRENCY.code,
          setTotalCash: '1000.00',
        });

        const deleteResponse = await helpers.deletePortfolio({ portfolioId: created.id });
        expect(deleteResponse.statusCode).toBe(200);

        // Portfolio invisible to standard endpoints
        const getResponse = await helpers.getPortfolio({ portfolioId: created.id });
        expect(getResponse.statusCode).toBe(ERROR_CODES.NotFoundError);

        // Holdings rows still exist in DB (we just hid the parent)
        const holdingsCount = await Holdings.count({ where: { portfolioId: created.id } });
        expect(holdingsCount).toBe(1);

        // And portfolio row has a deletedAt timestamp
        const trashed = await Portfolios.findOne({ where: { id: created.id }, paranoid: false });
        expect(trashed?.deletedAt).not.toBeNull();
      });

      it('should be idempotent — deleting the same portfolio twice succeeds', async () => {
        const created = await helpers.createPortfolio({ raw: true });

        const first = await helpers.deletePortfolio({ portfolioId: created.id });
        expect(first.statusCode).toBe(200);

        const second = await helpers.deletePortfolio({ portfolioId: created.id });
        expect(second.statusCode).toBe(200);
      });

      it('should treat a missing portfolio as a no-op success', async () => {
        const response = await helpers.deletePortfolio({ portfolioId: generateRandomRecordId() });
        expect(response.statusCode).toBe(200);
      });

      it('should surface soft-deleted portfolios in onlyDeleted=true listing', async () => {
        const trashed = await helpers.createPortfolio({ raw: true });
        const live = await helpers.createPortfolio({ raw: true });
        await helpers.deletePortfolio({ portfolioId: trashed.id });

        const trash = await helpers.listPortfolios({ onlyDeleted: true, raw: true });
        expect(trash.data.find((p) => p.id === trashed.id)).toBeDefined();
        expect(trash.data.find((p) => p.id === live.id)).toBeUndefined();
      });
    });

    describe('Validation errors', () => {
      it('should return ValidationError for invalid portfolio ID', async () => {
        const response = await helpers.deletePortfolio({
          portfolioId: 'invalid' as unknown as string,
        });
        expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      });
    });

    describe('Force delete (purge path)', () => {
      it('should hard-delete the portfolio and cascade every child table', async () => {
        const created = await helpers.createPortfolio({ raw: true });

        const usdCurrency = global.MODELS_CURRENCIES!.find((c: { code: string }) => c.code === 'USD');
        const currencyToUse = usdCurrency || global.BASE_CURRENCY;

        const investmentAccount = await helpers.createAccount({
          payload: helpers.buildAccountPayload({
            accountCategory: ACCOUNT_CATEGORIES.investment,
            currencyCode: currencyToUse.code,
          }),
          raw: true,
        });

        const [aapl] = await helpers.seedSecurities([{ symbol: 'AAPL', name: 'Apple Inc.' }]);

        await Holdings.create({
          portfolioId: created.id,
          securityId: aapl!.id,
          quantity: Money.zero(),
          costBasis: Money.zero(),
          refCostBasis: Money.zero(),
          currencyCode: 'USD',
        });

        await helpers.createInvestmentTransaction({
          payload: {
            portfolioId: created.id,
            securityId: aapl!.id,
            category: INVESTMENT_TRANSACTION_CATEGORY.buy,
            quantity: '5',
            price: '150',
            fees: '1',
          },
        });

        await helpers.updatePortfolioBalance({
          portfolioId: created.id,
          currencyCode: global.BASE_CURRENCY.code,
          setTotalCash: '500.00',
        });

        const response = await helpers.deletePortfolio({ portfolioId: created.id, force: true });
        expect(response.statusCode).toBe(200);

        // Portfolio row is gone, even when bypassing paranoid
        const remaining = await Portfolios.findOne({ where: { id: created.id }, paranoid: false });
        expect(remaining).toBeNull();

        // All three child tables cascaded out — guards against future drift if
        // someone refactors the force-delete and drops one of the destroy calls.
        expect(await Holdings.count({ where: { portfolioId: created.id } })).toBe(0);
        expect(await InvestmentTransaction.count({ where: { portfolioId: created.id } })).toBe(0);
        expect(await PortfolioBalances.count({ where: { portfolioId: created.id } })).toBe(0);
      });

      it('should also hard-delete an already-trashed portfolio', async () => {
        const created = await helpers.createPortfolio({ raw: true });
        await helpers.deletePortfolio({ portfolioId: created.id });

        const response = await helpers.deletePortfolio({ portfolioId: created.id, force: true });
        expect(response.statusCode).toBe(200);

        const remaining = await Portfolios.findOne({ where: { id: created.id }, paranoid: false });
        expect(remaining).toBeNull();
      });
    });
  });
});
