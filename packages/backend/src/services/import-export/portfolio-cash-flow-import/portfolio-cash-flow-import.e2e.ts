import { describe, expect, it } from '@jest/globals';
import Portfolios from '@models/investments/portfolios.model';
import * as helpers from '@tests/helpers';

/**
 * E2E coverage for the AI-powered portfolio cash-flow import flow.
 *
 * The /extract endpoint is intentionally NOT exercised here — it would call a
 * live LLM. We cover detect-duplicates and execute, which are the parts where
 * regressions would silently corrupt user data.
 */
describe('Portfolio cash-flow AI import', () => {
  describe('POST /import/portfolio-cash-flows/detect-duplicates', () => {
    it('returns no duplicates when the portfolio has no transfers', async () => {
      const portfolio: Portfolios = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Empty Portfolio' }),
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      const { duplicates } = await helpers.portfolioCashFlowDetectDuplicates({
        payload: {
          portfolioId: portfolio.id,
          rows: [
            {
              date: '2024-04-01',
              amount: 1000,
              currencyCode: account.currencyCode,
              direction: 'deposit',
            },
          ],
        },
        raw: true,
      });

      expect(duplicates).toEqual([]);
    });

    it('flags rows that match an existing transfer within ±2 days and $1', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Dup Test Portfolio' }),
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      // Seed an existing deposit on 2024-05-10 for $1000
      const existing = await helpers.directCashTransaction({
        portfolioId: portfolio.id,
        payload: {
          type: 'deposit',
          amount: '1000',
          currencyCode: account.currencyCode,
          date: '2024-05-10',
        },
        raw: true,
      });

      const { duplicates } = await helpers.portfolioCashFlowDetectDuplicates({
        payload: {
          portfolioId: portfolio.id,
          rows: [
            // Within window: 1 day off, $0.50 off → match
            {
              date: '2024-05-11',
              amount: 1000.5,
              currencyCode: account.currencyCode,
              direction: 'deposit',
            },
            // Outside date window: 5 days off → no match
            {
              date: '2024-05-15',
              amount: 1000,
              currencyCode: account.currencyCode,
              direction: 'deposit',
            },
            // Outside amount window: $1.50 off → no match
            {
              date: '2024-05-10',
              amount: 1001.5,
              currencyCode: account.currencyCode,
              direction: 'deposit',
            },
            // Wrong direction → no match
            {
              date: '2024-05-10',
              amount: 1000,
              currencyCode: account.currencyCode,
              direction: 'withdrawal',
            },
          ],
        },
        raw: true,
      });

      expect(duplicates).toHaveLength(1);
      expect(duplicates[0]!.rowIndex).toBe(0);
      expect(duplicates[0]!.existingTransferId).toBe(existing.id);
      expect(duplicates[0]!.existingDirection).toBe('deposit');
    });

    it('does not match across currencies', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Currency Match Portfolio' }),
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      await helpers.directCashTransaction({
        portfolioId: portfolio.id,
        payload: {
          type: 'deposit',
          amount: '1000',
          currencyCode: account.currencyCode,
          date: '2024-05-10',
        },
        raw: true,
      });

      const { duplicates } = await helpers.portfolioCashFlowDetectDuplicates({
        payload: {
          portfolioId: portfolio.id,
          rows: [
            // Same date / amount but different currency
            { date: '2024-05-10', amount: 1000, currencyCode: 'XAU', direction: 'deposit' },
          ],
        },
        raw: true,
      });

      expect(duplicates).toEqual([]);
    });
  });

  describe('POST /import/portfolio-cash-flows/extract (file path)', () => {
    /**
     * The extract endpoint hits a live LLM, so we only assert that the file
     * validation/extraction stage routes correctly. A *valid* file should
     * progress to the AI call (which fails with NO_AI_CONFIGURED in tests since
     * no API keys are configured) — proving the file pipeline ran. An *invalid*
     * file should fail earlier with a 4xx ValidationError, never reaching AI.
     */
    it('rejects a file that is too small / not a recognized format', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'File Reject Portfolio' }),
        raw: true,
      });

      const garbage = Buffer.from([0x00, 0x01, 0x02]);

      const response = await helpers.portfolioCashFlowExtract({
        payload: {
          portfolioId: portfolio.id,
          fileBase64: garbage.toString('base64'),
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(response.statusCode).toBeLessThan(500);
    });

    it('passes a valid CSV file through validation and extraction', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'File Valid Portfolio' }),
        raw: true,
      });

      const csv = ['date,amount,currency,direction', '2024-01-15,500,USD,deposit', '2024-04-20,750,USD,deposit'].join(
        '\n',
      );

      const response = await helpers.portfolioCashFlowExtract({
        payload: {
          portfolioId: portfolio.id,
          fileBase64: Buffer.from(csv, 'utf8').toString('base64'),
          fileName: 'flows.csv',
        },
      });

      // Either AI was unavailable (500 from NO_AI_CONFIGURED) or — if a key was
      // provided to the test env — the request actually succeeded (200). The
      // important assertion is that we did NOT fail with a 4xx, which would
      // mean the file pipeline rejected the input.
      expect([200, 500].includes(response.statusCode)).toBe(true);
    });
  });

  describe('POST /import/portfolio-cash-flows/execute', () => {
    it('imports rows atomically and respects per-row isHistorical', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Exec Portfolio' }),
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      const result = await helpers.portfolioCashFlowExecuteImport({
        payload: {
          portfolioId: portfolio.id,
          rows: [
            {
              date: '2024-01-15',
              amount: '500',
              currencyCode: account.currencyCode,
              direction: 'deposit',
              isHistorical: true,
            },
            {
              date: '2024-04-20',
              amount: '750',
              currencyCode: account.currencyCode,
              direction: 'deposit',
              isHistorical: false,
            },
          ],
        },
        raw: true,
      });

      expect(result.imported).toBe(2);
      expect(result.newTransferIds).toHaveLength(2);
      expect(result.errors).toEqual([]);

      // Cash balance should reflect ONLY the non-historical row.
      const [balance] = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode: account.currencyCode,
        raw: true,
      });
      expect(balance!.availableCash).toBeNumericEqual(750);

      // Both transfers should be visible in the list.
      const { data: transfers } = await helpers.listPortfolioTransfers({
        portfolioId: portfolio.id,
        raw: true,
      });
      expect(transfers).toHaveLength(2);
    });

    it('rolls the whole batch back when one row is invalid', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Rollback Portfolio' }),
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });

      const response = await helpers.portfolioCashFlowExecuteImport({
        payload: {
          portfolioId: portfolio.id,
          rows: [
            {
              date: '2024-02-01',
              amount: '300',
              currencyCode: account.currencyCode,
              direction: 'deposit',
              isHistorical: false,
            },
            // Bad row: unknown currency → directCashTransaction throws
            {
              date: '2024-02-05',
              amount: '100',
              currencyCode: 'ZZZ',
              direction: 'deposit',
              isHistorical: false,
            },
          ],
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);

      // No transfers should have been written, and the cash balance should be untouched.
      const { data: transfers } = await helpers.listPortfolioTransfers({
        portfolioId: portfolio.id,
        raw: true,
      });
      expect(transfers).toEqual([]);

      const balances = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode: account.currencyCode,
        raw: true,
      });
      if (balances.length > 0) {
        expect(balances[0]!.availableCash).toBeNumericEqual(0);
      }
    });
  });
});
