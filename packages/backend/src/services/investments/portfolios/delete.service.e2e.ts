import { ACCOUNT_CATEGORIES } from '@bt/shared/types';
import { INVESTMENT_TRANSACTION_CATEGORY, PORTFOLIO_TRASH_RETENTION_DAYS } from '@bt/shared/types/investments';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import Holdings from '@models/investments/holdings.model';
import InvestmentTransaction from '@models/investments/investment-transaction.model';
import PortfolioBalances from '@models/investments/portfolio-balances.model';
import Portfolios from '@models/investments/portfolios.model';
import { purgeDeletedPortfolios } from '@services/investments/portfolios/purge-deleted.service';
import * as helpers from '@tests/helpers';
import { subDays } from 'date-fns';

describe('Delete Portfolio Service E2E', () => {
  describe('DELETE /investments/portfolios/:id', () => {
    describe('Soft delete (default)', () => {
      it('should hide a soft-deleted portfolio from the default list and GET, surface it in onlyDeleted listing, and no-op on repeat or unknown deletes', async () => {
        const target = await helpers.createPortfolio({ raw: true });
        const live = await helpers.createPortfolio({ raw: true });

        const deleteResponse = await helpers.deletePortfolio({ portfolioId: target.id });
        expect(deleteResponse.statusCode).toBe(200);

        const list = await helpers.listPortfolios({ raw: true });
        expect(list.data.find((p) => p.id === target.id)).toBeUndefined();

        const getResponse = await helpers.getPortfolio({ portfolioId: target.id });
        expect(getResponse.statusCode).toBe(ERROR_CODES.NotFoundError);

        const trash = await helpers.listPortfolios({ onlyDeleted: true, raw: true });
        expect(trash.data.find((p) => p.id === target.id)).toBeDefined();
        expect(trash.data.find((p) => p.id === live.id)).toBeUndefined();

        const secondDelete = await helpers.deletePortfolio({ portfolioId: target.id });
        expect(secondDelete.statusCode).toBe(200);

        const unknownDelete = await helpers.deletePortfolio({ portfolioId: generateRandomRecordId() });
        expect(unknownDelete.statusCode).toBe(200);
      }, 30000);
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
      it('should keep child rows on soft delete, then cascade every child table when the trashed portfolio is force-deleted', async () => {
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
          accountId: investmentAccount.id,
          securityId: vooSecurity!.id,
          quantity: '0',
          costBasis: '0',
          refCostBasis: '0',
          value: '0',
          refValue: '0',
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

        const softDeleteResponse = await helpers.deletePortfolio({ portfolioId: created.id });
        expect(softDeleteResponse.statusCode).toBe(200);

        const getResponse = await helpers.getPortfolio({ portfolioId: created.id });
        expect(getResponse.statusCode).toBe(ERROR_CODES.NotFoundError);

        // Child rows survive a soft delete; only the parent is hidden.
        expect(await Holdings.count({ where: { portfolioId: created.id } })).toBe(1);

        const trashed = await Portfolios.findOne({ where: { id: created.id }, paranoid: false });
        expect(trashed?.deletedAt).not.toBeNull();

        const forceResponse = await helpers.deletePortfolio({ portfolioId: created.id, force: true });
        expect(forceResponse.statusCode).toBe(200);

        const remaining = await Portfolios.findOne({ where: { id: created.id }, paranoid: false });
        expect(remaining).toBeNull();

        // Guards against a refactor dropping one of the three destroy calls.
        expect(await Holdings.count({ where: { portfolioId: created.id } })).toBe(0);
        expect(await InvestmentTransaction.count({ where: { portfolioId: created.id } })).toBe(0);
        expect(await PortfolioBalances.count({ where: { portfolioId: created.id } })).toBe(0);
      }, 30000);
    });
  });

  describe('Restore (POST /investments/portfolios/:id/restore)', () => {
    it('should restore a soft-deleted portfolio and bring it back into the list', async () => {
      const created = await helpers.createPortfolio({ raw: true });
      await helpers.deletePortfolio({ portfolioId: created.id });

      const response = await helpers.restorePortfolio({ portfolioId: created.id });
      expect(response.statusCode).toBe(200);

      const list = await helpers.listPortfolios({ raw: true });
      expect(list.data.find((p) => p.id === created.id)).toBeDefined();

      const trash = await helpers.listPortfolios({ onlyDeleted: true, raw: true });
      expect(trash.data.find((p) => p.id === created.id)).toBeUndefined();
    });

    it('should return ValidationError for a live portfolio and 404 for an unknown one', async () => {
      const created = await helpers.createPortfolio({ raw: true });

      const liveResponse = await helpers.restorePortfolio({ portfolioId: created.id });
      expect(liveResponse.statusCode).toBe(ERROR_CODES.ValidationError);

      const unknownResponse = await helpers.restorePortfolio({ portfolioId: generateRandomRecordId() });
      expect(unknownResponse.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });

  describe('Purge deleted portfolios', () => {
    it('should purge portfolios soft-deleted past the retention window and leave fresh trash + live portfolios alone', async () => {
      const expired = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Expired Trash' }),
        raw: true,
      });
      const fresh = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Fresh Trash' }),
        raw: true,
      });
      const live = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Live Portfolio' }),
        raw: true,
      });

      await helpers.deletePortfolio({ portfolioId: expired.id });
      await helpers.deletePortfolio({ portfolioId: fresh.id });

      const stale = subDays(new Date(), PORTFOLIO_TRASH_RETENTION_DAYS + 1);
      await Portfolios.update({ deletedAt: stale }, { where: { id: expired.id }, paranoid: false });

      const result = await purgeDeletedPortfolios();
      expect(result.purgedCount).toBe(1);
      expect(result.failedCount).toBe(0);

      const expiredRow = await Portfolios.findOne({ where: { id: expired.id }, paranoid: false });
      expect(expiredRow).toBeNull();

      const freshRow = await Portfolios.findOne({ where: { id: fresh.id }, paranoid: false });
      expect(freshRow).not.toBeNull();
      expect(freshRow?.deletedAt).not.toBeNull();

      // Live portfolio (never trashed) must survive the purge.
      const liveRow = await Portfolios.findOne({ where: { id: live.id }, paranoid: false });
      expect(liveRow).not.toBeNull();
      expect(liveRow?.deletedAt).toBeNull();
    });

    it('should be a no-op when nothing is past retention', async () => {
      const result = await purgeDeletedPortfolios();
      expect(result.purgedCount).toBe(0);
      expect(result.failedCount).toBe(0);
    });
  });
});
