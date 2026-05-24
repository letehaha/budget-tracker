/**
 * E2E coverage for the CSV path of investment transactions import.
 *
 * AI-path coverage lives in `transactions-import.e2e.ts` — this file targets
 * the `extract` endpoint when called with `source: 'csv'`. The corresponding
 * parse step happens client-side (papaparse) so there's no backend endpoint to
 * test there.
 *
 * Pattern follows CLAUDE.md: every assertion runs through the HTTP test
 * helpers — no direct service calls.
 */
import {
  ASSET_CLASS,
  INVESTMENT_IMPORT_SIDE_SKIP,
  INVESTMENT_TRANSACTION_CATEGORY,
  type InvestmentColumnMapping,
  SECURITY_PROVIDER,
} from '@bt/shared/types/investments';
import { beforeEach, describe, expect, it } from '@jest/globals';
import Securities from '@models/investments/securities.model';
import * as helpers from '@tests/helpers';

import { dataProviderFactory } from '../../../services/investments/data-providers/provider-factory';

/**
 * Inline copy of `createCryptoSecurity` from `transactions-import.e2e.ts`.
 * Direct DB insert seeds a Security row the user already holds — `resolveSymbols`
 * picks it up via the user-securities branch and the CSV path doesn't need to
 * exercise the CoinGecko mock.
 */
async function createCryptoSecurity({
  symbol,
  name,
  providerSymbol,
}: {
  symbol: string;
  name: string;
  providerSymbol: string;
}) {
  return Securities.create({
    symbol,
    name,
    providerSymbol,
    providerName: SECURITY_PROVIDER.coingecko,
    assetClass: ASSET_CLASS.crypto,
    currencyCode: 'USD',
    cryptoCurrencyCode: symbol,
    exchangeName: 'CoinGecko',
    isBrokerageCash: false,
  });
}

/** Encode CSV text as base64 for the upload endpoint. */
function encode(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64');
}

/**
 * Build a column mapping with sensible defaults for the BTC/ETH crypto CSVs
 * the tests use. Individual tests override only the fields they care about.
 */
function buildMapping(overrides: Partial<InvestmentColumnMapping> = {}): InvestmentColumnMapping {
  return {
    symbol: 'Symbol',
    date: 'Date',
    side: 'Action',
    quantity: 'Quantity',
    price: 'Price',
    fees: 'Fees',
    currency: 'Currency',
    name: null,
    defaultCurrency: 'USD',
    defaultAssetClassHint: 'crypto',
    sideValueMapping: {
      Buy: INVESTMENT_TRANSACTION_CATEGORY.buy,
      Sell: INVESTMENT_TRANSACTION_CATEGORY.sell,
      Dividend: INVESTMENT_TRANSACTION_CATEGORY.dividend,
    },
    ...overrides,
  };
}

describe('Investment transactions CSV import — E2E', () => {
  beforeEach(() => {
    dataProviderFactory.clearCache();
  });

  describe('extract source=csv', () => {
    it('groups CSV rows into holdings, resolves the existing security, computes amount', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'CSV Crypto' }),
        raw: true,
      });

      const btc = await createCryptoSecurity({ symbol: 'BTC', name: 'Bitcoin', providerSymbol: 'bitcoin' });
      await helpers.createHolding({ payload: { portfolioId: portfolio.id, securityId: btc.id } });

      const csv = [
        'Symbol,Date,Action,Quantity,Price,Fees,Currency',
        'BTC,2024-01-15,Buy,0.05,42000,5.25,USDT',
        'BTC,2024-02-20,Sell,0.02,50000,2.10,USDT',
      ].join('\n');

      const result = await helpers.investmentImportExtract({
        payload: {
          source: 'csv',
          fileBase64: encode(csv),
          defaultPortfolioId: portfolio.id,
          columnMapping: buildMapping(),
        },
        raw: true,
      });

      expect(result.holdings).toHaveLength(1);
      const holding = result.holdings[0]!;
      expect(holding.parsedSymbol).toBe('BTC');
      expect(holding.resolvedSecurity?.securityId).toBe(btc.id);
      expect(holding.resolvedConfidence).toBe('auto');
      expect(holding.currencyCode).toBe('USD'); // USDT → USD
      expect(holding.transactions).toHaveLength(2);
      expect(holding.transactions[0]!.side).toBe('buy');
      expect(holding.transactions[1]!.side).toBe('sell');
      // amount = quantity * price + fees
      expect(holding.transactions[0]!.amount).toBe('2105.2500000000');
      expect(holding.transactions[1]!.amount).toBe('1002.1000000000');
      expect(result.fileType).toBe('csv');
      expect(result.tokenCount).toEqual({ input: 0, output: 0 });
    });

    it('parses tolerant locale formats (1,234.56 and 1.234,56) in quantity/price', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'CSV locale' }),
        raw: true,
      });

      const btc = await createCryptoSecurity({ symbol: 'BTC', name: 'Bitcoin', providerSymbol: 'bitcoin' });
      await helpers.createHolding({ payload: { portfolioId: portfolio.id, securityId: btc.id } });

      // Two rows with different locale formatting for the same numeric value.
      const csv = [
        'Symbol,Date,Action,Quantity,Price,Fees,Currency',
        // US locale, US$ symbol on price — also covers currency-symbol stripping.
        'BTC,2024-01-15,Buy,0.05,"$42,000.00",5.25,USDT',
        // European locale.
        'BTC,2024-02-20,Sell,0.02,"50.000,00",2.10,USDT',
      ].join('\n');

      const result = await helpers.investmentImportExtract({
        payload: {
          source: 'csv',
          fileBase64: encode(csv),
          defaultPortfolioId: portfolio.id,
          columnMapping: buildMapping(),
        },
        raw: true,
      });

      expect(result.holdings).toHaveLength(1);
      expect(result.holdings[0]!.transactions).toHaveLength(2);
      expect(result.holdings[0]!.transactions[0]!.price).toBe('42000');
      expect(result.holdings[0]!.transactions[1]!.price).toBe('50000');
    });

    it('rejects when a mapped column does not exist in the CSV headers', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'CSV bad mapping' }),
        raw: true,
      });

      const csv = ['Symbol,Date,Action,Quantity,Price', 'BTC,2024-01-15,Buy,0.05,42000'].join('\n');

      const result = await helpers.investmentImportExtract({
        payload: {
          source: 'csv',
          fileBase64: encode(csv),
          defaultPortfolioId: portfolio.id,
          columnMapping: buildMapping({ symbol: 'TickerThatDoesntExist' }),
        },
      });

      expect(result.statusCode).not.toBe(200);
    });

    it('surfaces unparseable rows as a warning instead of failing the extract', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'CSV invalid rows' }),
        raw: true,
      });

      const btc = await createCryptoSecurity({ symbol: 'BTC', name: 'Bitcoin', providerSymbol: 'bitcoin' });
      await helpers.createHolding({ payload: { portfolioId: portfolio.id, securityId: btc.id } });

      const csv = [
        'Symbol,Date,Action,Quantity,Price,Fees,Currency',
        // valid
        'BTC,2024-01-15,Buy,0.05,42000,5.25,USDT',
        // invalid: side "Swap" not in mapping
        'BTC,2024-01-16,Swap,0.01,42000,0,USDT',
        // invalid: unparseable date
        'BTC,not-a-date,Buy,0.01,42000,0,USDT',
        // invalid: missing symbol
        ',2024-01-17,Buy,0.01,42000,0,USDT',
      ].join('\n');

      const result = await helpers.investmentImportExtract({
        payload: {
          source: 'csv',
          fileBase64: encode(csv),
          defaultPortfolioId: portfolio.id,
          columnMapping: buildMapping(),
        },
        raw: true,
      });

      expect(result.holdings).toHaveLength(1);
      expect(result.holdings[0]!.transactions).toHaveLength(1);

      const skipWarning = result.warnings.find((w) => w.startsWith('3 of 4 CSV row(s) were skipped'));
      expect(skipWarning).toBeDefined();
      expect(skipWarning).toContain('Unmapped side value "Swap"');
      expect(skipWarning).toContain('Unparseable date "not-a-date"');
      expect(skipWarning).toContain('Missing symbol');
    });

    it('preserves a dividend row alongside trades without trying to dedup against trade history', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'CSV with dividend' }),
        raw: true,
      });

      const btc = await createCryptoSecurity({ symbol: 'BTC', name: 'Bitcoin', providerSymbol: 'bitcoin' });
      await helpers.createHolding({ payload: { portfolioId: portfolio.id, securityId: btc.id } });

      const csv = [
        'Symbol,Date,Action,Quantity,Price,Fees,Currency',
        'BTC,2024-01-15,Buy,0.05,42000,0,USDT',
        // Dividend row — quantity (units received), price (per-unit value), fees 0.
        'BTC,2024-02-01,Dividend,0.001,42500,0,USDT',
      ].join('\n');

      const result = await helpers.investmentImportExtract({
        payload: {
          source: 'csv',
          fileBase64: encode(csv),
          defaultPortfolioId: portfolio.id,
          columnMapping: buildMapping(),
        },
        raw: true,
      });

      expect(result.holdings).toHaveLength(1);
      expect(result.holdings[0]!.transactions.map((t) => t.side)).toEqual(['buy', 'dividend']);
    });

    it('silently drops rows whose side value is mapped to the skip sentinel', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'CSV with skip' }),
        raw: true,
      });

      const btc = await createCryptoSecurity({ symbol: 'BTC', name: 'Bitcoin', providerSymbol: 'bitcoin' });
      await helpers.createHolding({ payload: { portfolioId: portfolio.id, securityId: btc.id } });

      const csv = [
        'Symbol,Date,Action,Quantity,Price,Fees,Currency',
        'BTC,2024-01-15,Buy,0.05,42000,0,USDT',
        // Cash-movement rows — user marked these as skip; they should not appear
        // in holdings AND should not pollute the invalid-rows warning list.
        'CASH,2024-01-20,Deposit,500,1,0,USD',
        'CASH,2024-01-21,Withdrawal,200,1,0,USD',
        'BTC,2024-02-20,Sell,0.02,50000,0,USDT',
      ].join('\n');

      const result = await helpers.investmentImportExtract({
        payload: {
          source: 'csv',
          fileBase64: encode(csv),
          defaultPortfolioId: portfolio.id,
          columnMapping: buildMapping({
            sideValueMapping: {
              Buy: INVESTMENT_TRANSACTION_CATEGORY.buy,
              Sell: INVESTMENT_TRANSACTION_CATEGORY.sell,
              Deposit: INVESTMENT_IMPORT_SIDE_SKIP,
              Withdrawal: INVESTMENT_IMPORT_SIDE_SKIP,
            },
          }),
        },
        raw: true,
      });

      expect(result.holdings).toHaveLength(1);
      expect(result.holdings[0]!.transactions.map((t) => t.side)).toEqual(['buy', 'sell']);
      // Critical: no "N of M CSV rows were skipped" warning — skip is deliberate.
      expect(result.warnings.find((w) => w.includes('CSV row(s) were skipped'))).toBeUndefined();
    });

    it('splits compound tickers like SOL-USD into ticker + quote currency', async () => {
      // Yahoo Finance + most crypto-aware exports use TICKER-CURRENCY for the
      // symbol column. Resolver only knows bare tickers — without the split
      // we'd try to look up `SOL-USD` on CoinGecko and miss every row.
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'CSV compound tickers' }),
        raw: true,
      });

      const sol = await createCryptoSecurity({ symbol: 'SOL', name: 'Solana', providerSymbol: 'solana' });
      await helpers.createHolding({ payload: { portfolioId: portfolio.id, securityId: sol.id } });

      const csv = [
        // No currency column on purpose so the ticker suffix has to do the work.
        'Symbol,Date,Action,Quantity,Price',
        'SOL-USD,2024-01-15,Buy,1.5,85.12',
        'SOL-USD,2024-02-20,Sell,0.5,90.00',
      ].join('\n');

      const result = await helpers.investmentImportExtract({
        payload: {
          source: 'csv',
          fileBase64: encode(csv),
          defaultPortfolioId: portfolio.id,
          columnMapping: buildMapping({
            // Currency + Fees columns intentionally unmapped — relies on the
            // ticker suffix for currency and on the parser's "fees default to 0".
            fees: null,
            currency: null,
            defaultCurrency: null,
          }),
        },
        raw: true,
      });

      expect(result.holdings).toHaveLength(1);
      // Symbol is the SOL head, not the compound SOL-USD.
      expect(result.holdings[0]!.parsedSymbol).toBe('SOL');
      expect(result.holdings[0]!.resolvedSecurity?.securityId).toBe(sol.id);
      // Currency was inferred from the ticker suffix.
      expect(result.holdings[0]!.currencyCode).toBe('USD');
      expect(result.holdings[0]!.transactions).toHaveLength(2);
    });
  });
});
