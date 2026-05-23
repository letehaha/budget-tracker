import { ASSET_CLASS, INVESTMENT_TRANSACTION_CATEGORY, SECURITY_PROVIDER } from '@bt/shared/types/investments';
import Coingecko from '@coingecko/coingecko-typescript';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import InvestmentTransaction from '@models/investments/investment-transaction.model';
import Securities from '@models/investments/securities.model';
import * as helpers from '@tests/helpers';
import { VALID_GEMINI_API_KEY } from '@tests/mocks/gemini/mock-api';
import { HttpResponse, http } from 'msw';

import { dataProviderFactory } from '../../../services/investments/data-providers/provider-factory';
import { DUPLICATE_DATE_WINDOW_DAYS } from './detect-duplicates.service';

/**
 * Direct DB insert of a crypto Security row. Used by tests that need an
 * existing crypto holding the AI's symbol resolver can latch onto — the
 * shared `helpers.seedSecurities` goes through FMP (stocks-only).
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

/**
 * Build a single CSV row in the format the AI prompt asks for.
 * symbol,name,date,side,quantity,price,fees,currency,assetClassHint,confidence
 */
const csvRow = ({
  symbol,
  name = '',
  date,
  side,
  quantity,
  price,
  fees = '0',
  currency = 'USDT',
  assetClassHint = 'crypto',
  confidence = 95,
}: {
  symbol: string;
  name?: string;
  date: string;
  side: 'B' | 'S';
  quantity: string;
  price: string;
  fees?: string;
  currency?: string;
  assetClassHint?: 'crypto' | 'stocks';
  confidence?: number;
}) => `${symbol},${name},${date},${side},${quantity},${price},${fees},${currency},${assetClassHint},${confidence}`;

/**
 * MSW handler that returns a fixed CSV from Gemini's generateContent endpoint.
 * The Vercel AI SDK with `createGoogleGenerativeAI({ apiKey })` calls
 * https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent
 */
function geminiCsvHandler({ csv }: { csv: string }) {
  return http.post(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent',
    () =>
      HttpResponse.json({
        candidates: [
          {
            content: { parts: [{ text: csv }], role: 'model' },
            finishReason: 'STOP',
            index: 0,
          },
        ],
        usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 60, totalTokenCount: 260 },
      }),
  );
}

/** Encode a string source file as base64 for the upload endpoint. */
function encodeFile({ text }: { text: string }): string {
  return Buffer.from(text, 'utf-8').toString('base64');
}

/** Shift a YYYY-MM-DD string by `days`. UTC-anchored to avoid DST drift. */
function addDays({ date, days }: { date: string; days: number }): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Fixed reference values for the date-window dedup tests. Every test in that
 * group seeds an existing BTC buy at these values and varies only the
 * *imported* row to exercise one boundary at a time. Quantity * price = 2100,
 * so any imported row with a different qty must adjust price to match amount.
 */
const DEDUP_BASE_DATE = '2024-01-15';
const DEDUP_BASE_QUANTITY = '0.05';
const DEDUP_BASE_PRICE = '42000';

/**
 * Set up a portfolio + existing BTC buy at the DEDUP_BASE_* values, then run
 * the import-extract for a single row whose date is offset by `dayOffset` from
 * DEDUP_BASE_DATE (and optionally with overridden quantity/price). Returns
 * the imported row's `possibleDuplicateOf` so tests can just assert on it.
 */
async function runBtcDedupExtract({
  dayOffset,
  importedQuantity = DEDUP_BASE_QUANTITY,
  importedPrice = DEDUP_BASE_PRICE,
}: {
  dayOffset: number;
  importedQuantity?: string;
  importedPrice?: string;
}) {
  const portfolio = await helpers.createPortfolio({
    payload: helpers.buildPortfolioPayload({ name: 'Crypto' }),
    raw: true,
  });

  const btc = await createCryptoSecurity({ symbol: 'BTC', name: 'Bitcoin', providerSymbol: 'bitcoin' });
  await helpers.createHolding({ payload: { portfolioId: portfolio.id, securityId: btc.id } });
  await helpers.createInvestmentTransaction({
    payload: {
      portfolioId: portfolio.id,
      securityId: btc.id,
      category: INVESTMENT_TRANSACTION_CATEGORY.buy,
      date: DEDUP_BASE_DATE,
      quantity: DEDUP_BASE_QUANTITY,
      price: DEDUP_BASE_PRICE,
    },
  });

  installCoingeckoMock({
    coins: [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', market_cap_rank: 1 }],
  });

  const importedDate = addDays({ date: DEDUP_BASE_DATE, days: dayOffset });
  const csv = csvRow({
    symbol: 'BTC',
    date: importedDate,
    side: 'B',
    quantity: importedQuantity,
    price: importedPrice,
  });
  global.mswMockServer.use(geminiCsvHandler({ csv }));

  const result = await helpers.investmentImportExtract({
    payload: {
      fileBase64: encodeFile({
        text: `BTC BUY ${dayOffset} days from base (qty=${importedQuantity}, px=${importedPrice})`,
      }),
      defaultPortfolioId: portfolio.id,
    },
    raw: true,
  });

  return result.holdings[0]!.transactions[0]!.possibleDuplicateOf;
}

const mockedCoingecko = jest.mocked(Coingecko);

/** Install a CoinGecko mock that returns the given coin list for any search. */
function installCoingeckoMock({
  coins,
}: {
  coins: Array<{ id: string; symbol: string; name: string; market_cap_rank: number }>;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const searchGet = jest.fn<any>().mockResolvedValue({ coins });
  mockedCoingecko.mockImplementation(
    () =>
      ({
        search: { get: searchGet },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        simple: { price: { get: jest.fn<any>().mockResolvedValue({}) } },
        coins: {
          marketChart: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            get: jest.fn<any>().mockResolvedValue({ prices: [] }),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            getRange: jest.fn<any>().mockResolvedValue({ prices: [] }),
          },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
  );
  return { searchGet };
}

describe('Investment transactions AI import — E2E', () => {
  let originalGeminiKey: string | undefined;

  beforeEach(() => {
    originalGeminiKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = VALID_GEMINI_API_KEY;
    jest.clearAllMocks();
    dataProviderFactory.clearCache();
  });

  afterEach(() => {
    if (originalGeminiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalGeminiKey;
    }
  });

  describe('extract', () => {
    it('returns a hierarchical holding for an AI-resolved single coin', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Crypto' }),
        raw: true,
      });

      installCoingeckoMock({
        coins: [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', market_cap_rank: 1 }],
      });

      const csv =
        csvRow({ symbol: 'BTC', name: 'Bitcoin', date: '2024-01-15', side: 'B', quantity: '0.05', price: '42000' }) +
        '\n' +
        csvRow({ symbol: 'BTC', name: 'Bitcoin', date: '2024-02-20', side: 'S', quantity: '0.02', price: '50000' });

      global.mswMockServer.use(geminiCsvHandler({ csv }));

      const result = await helpers.investmentImportExtract({
        payload: {
          fileBase64: encodeFile({ text: 'Binance export\nBTC 0.05 @ 42000 USDT on 2024-01-15' }),
          defaultPortfolioId: portfolio.id,
        },
        raw: true,
      });

      expect(result.holdings).toHaveLength(1);
      const holding = result.holdings[0]!;
      expect(holding.parsedSymbol).toBe('BTC');
      expect(holding.resolvedSecurity).toMatchObject({
        providerSymbol: 'bitcoin',
        symbol: 'BTC',
        alreadyInDb: false,
      });
      expect(holding.resolvedConfidence).toBe('auto');
      expect(holding.currencyCode).toBe('USD'); // USDT → USD
      expect(holding.portfolioId).toBe(portfolio.id);
      expect(holding.transactions).toHaveLength(2);
      expect(holding.transactions[0]!.side).toBe('buy');
      expect(holding.transactions[1]!.side).toBe('sell');
    });

    it('leaves the security unresolved when CoinGecko returns ambiguous matches', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Crypto' }),
        raw: true,
      });

      installCoingeckoMock({
        coins: [
          { id: 'ethereum', symbol: 'eth', name: 'Ethereum', market_cap_rank: 2 },
          { id: 'scam-eth', symbol: 'eth', name: 'Scam ETH', market_cap_rank: 99999 },
        ],
      });

      const csv = csvRow({ symbol: 'ETH', date: '2024-03-01', side: 'B', quantity: '1', price: '2000' });
      global.mswMockServer.use(geminiCsvHandler({ csv }));

      const result = await helpers.investmentImportExtract({
        payload: {
          fileBase64: encodeFile({ text: 'ETH 1 @ 2000 USDT' }),
          defaultPortfolioId: portfolio.id,
        },
        raw: true,
      });

      expect(result.holdings).toHaveLength(1);
      expect(result.holdings[0]!.resolvedSecurity).toBeNull();
      expect(result.holdings[0]!.resolvedConfidence).toBe('ambiguous');
    });

    it('flags row as possible duplicate when an existing transaction matches', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Crypto' }),
        raw: true,
      });

      // Seed a CRYPTO BTC (provider=coingecko, providerSymbol='bitcoin') so the
      // AI's resolveSymbols path finds the user's existing security via
      // `(assetClass=crypto, symbol='BTC')` and the dedup query uses that
      // same securityId.
      const btc = await createCryptoSecurity({ symbol: 'BTC', name: 'Bitcoin', providerSymbol: 'bitcoin' });
      await helpers.createHolding({
        payload: { portfolioId: portfolio.id, securityId: btc.id },
      });
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: portfolio.id,
          securityId: btc.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          date: '2024-01-15',
          quantity: '0.05',
          price: '42000',
        },
      });

      // Even though resolution should match against the user's own security,
      // install a CoinGecko mock to be safe (resolver falls through to provider
      // if user security lookup misses).
      installCoingeckoMock({
        coins: [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', market_cap_rank: 1 }],
      });

      const csv = csvRow({ symbol: 'BTC', date: '2024-01-15', side: 'B', quantity: '0.05', price: '42000' });
      global.mswMockServer.use(geminiCsvHandler({ csv }));

      const result = await helpers.investmentImportExtract({
        payload: {
          fileBase64: encodeFile({ text: 'BTC 0.05 @ 42000 USDT 2024-01-15' }),
          defaultPortfolioId: portfolio.id,
        },
        raw: true,
      });

      const tx = result.holdings[0]!.transactions[0]!;
      expect(tx.possibleDuplicateOf).not.toBeNull();
    });

    it('resolves a stocks row against a pre-existing stocks holding', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Stocks' }),
        raw: true,
      });

      // Seed AAPL (FMP/stocks) and attach a holding so the resolver finds it
      // via the user's own securities in Step 1 — no provider lookup needed.
      const [aapl] = await helpers.seedSecurities([{ symbol: 'AAPL', name: 'Apple Inc.' }]);
      await helpers.createHolding({
        payload: { portfolioId: portfolio.id, securityId: aapl!.id },
      });

      const csv = csvRow({
        symbol: 'AAPL',
        name: 'Apple Inc.',
        date: '2024-05-01',
        side: 'B',
        quantity: '10',
        price: '180.25',
        currency: 'USD',
        assetClassHint: 'stocks',
      });
      global.mswMockServer.use(geminiCsvHandler({ csv }));

      const result = await helpers.investmentImportExtract({
        payload: {
          fileBase64: encodeFile({ text: 'AAPL 10 @ 180.25 USD on 2024-05-01' }),
          defaultPortfolioId: portfolio.id,
        },
        raw: true,
      });

      expect(result.holdings).toHaveLength(1);
      const holding = result.holdings[0]!;
      expect(holding.parsedSymbol).toBe('AAPL');
      expect(holding.resolvedSecurity).toMatchObject({
        securityId: aapl!.id,
        symbol: 'AAPL',
        assetClass: ASSET_CLASS.stocks,
        alreadyInDb: true,
      });
      expect(holding.resolvedConfidence).toBe('auto');
      expect(holding.hasExistingHolding).toBe(true);
      expect(holding.currencyCode).toBe('USD');
    });

    it('fails with NO_AI_CONFIGURED when the AI key is unavailable', async () => {
      delete process.env.GEMINI_API_KEY;

      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Crypto' }),
        raw: true,
      });

      const response = await helpers.investmentImportExtract({
        payload: {
          fileBase64: encodeFile({ text: 'BTC 0.05 @ 42000 USDT' }),
          defaultPortfolioId: portfolio.id,
        },
      });

      expect(response.statusCode).not.toBe(200);
    });

    it('fails when the AI returns an empty CSV (NO_TRANSACTIONS_FOUND)', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Crypto' }),
        raw: true,
      });

      installCoingeckoMock({ coins: [] });
      global.mswMockServer.use(geminiCsvHandler({ csv: '' }));

      const response = await helpers.investmentImportExtract({
        payload: {
          fileBase64: encodeFile({ text: 'no transactions in here' }),
          defaultPortfolioId: portfolio.id,
        },
      });

      expect(response.statusCode).not.toBe(200);
    });

    it('keeps currencyCode null and surfaces a warning when AI returns a crypto/crypto pair', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Crypto' }),
        raw: true,
      });

      installCoingeckoMock({
        coins: [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', market_cap_rank: 1 }],
      });

      // currency='' triggers normaliseCurrency() => null in the resolver.
      const csv = csvRow({ symbol: 'BTC', date: '2024-01-15', side: 'B', quantity: '0.1', price: '20', currency: '' });
      global.mswMockServer.use(geminiCsvHandler({ csv }));

      const result = await helpers.investmentImportExtract({
        payload: {
          fileBase64: encodeFile({ text: 'BTC 0.1 @ 20 ETH (crypto/crypto pair)' }),
          defaultPortfolioId: portfolio.id,
        },
        raw: true,
      });

      expect(result.holdings).toHaveLength(1);
      expect(result.holdings[0]!.currencyCode).toBeNull();
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('groups multi-symbol CSVs into one holding per symbol', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Crypto' }),
        raw: true,
      });

      installCoingeckoMock({
        coins: [
          { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', market_cap_rank: 1 },
          { id: 'ethereum', symbol: 'eth', name: 'Ethereum', market_cap_rank: 2 },
        ],
      });

      const csv = [
        csvRow({ symbol: 'BTC', date: '2024-01-15', side: 'B', quantity: '0.05', price: '42000' }),
        csvRow({ symbol: 'ETH', date: '2024-02-01', side: 'B', quantity: '1', price: '2300' }),
      ].join('\n');
      global.mswMockServer.use(geminiCsvHandler({ csv }));

      const result = await helpers.investmentImportExtract({
        payload: {
          fileBase64: encodeFile({ text: 'multi BTC/ETH csv' }),
          defaultPortfolioId: portfolio.id,
        },
        raw: true,
      });

      expect(result.holdings).toHaveLength(2);
      const symbols = result.holdings.map((h) => h.parsedSymbol).toSorted();
      expect(symbols).toEqual(['BTC', 'ETH']);
    });

    it('does not flag a possible duplicate when buy/sell sides differ on the same date + quantity', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Crypto' }),
        raw: true,
      });

      // Pre-seed an existing BUY of 0.05 BTC on 2024-01-15.
      const btc = await createCryptoSecurity({ symbol: 'BTC', name: 'Bitcoin', providerSymbol: 'bitcoin' });
      await helpers.createHolding({ payload: { portfolioId: portfolio.id, securityId: btc.id } });
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: portfolio.id,
          securityId: btc.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          date: '2024-01-15',
          quantity: '0.05',
          price: '42000',
        },
      });

      installCoingeckoMock({
        coins: [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', market_cap_rank: 1 }],
      });

      // Import a SELL of 0.05 on the same date — must NOT be flagged as a dup.
      const csv = csvRow({ symbol: 'BTC', date: '2024-01-15', side: 'S', quantity: '0.05', price: '42000' });
      global.mswMockServer.use(geminiCsvHandler({ csv }));

      const result = await helpers.investmentImportExtract({
        payload: {
          fileBase64: encodeFile({ text: 'BTC SELL same day same qty' }),
          defaultPortfolioId: portfolio.id,
        },
        raw: true,
      });

      expect(result.holdings[0]!.transactions[0]!.possibleDuplicateOf).toBeNull();
    });

    // Date-window dedup boundary tests. All cases use the same seeded BUY
    // (DEDUP_BASE_DATE / DEDUP_BASE_QUANTITY / DEDUP_BASE_PRICE) and vary
    // only the imported row. Dates are derived from DUPLICATE_DATE_WINDOW_DAYS
    // so widening or narrowing the window changes what these tests exercise
    // without requiring any code changes here.
    it(`flags a duplicate when the imported row is exactly +DUPLICATE_DATE_WINDOW_DAYS (${DUPLICATE_DATE_WINDOW_DAYS}) days later`, async () => {
      const possibleDuplicateOf = await runBtcDedupExtract({ dayOffset: DUPLICATE_DATE_WINDOW_DAYS });
      expect(possibleDuplicateOf).not.toBeNull();
    });

    it(`flags a duplicate when the imported row is exactly -DUPLICATE_DATE_WINDOW_DAYS (${DUPLICATE_DATE_WINDOW_DAYS}) days earlier (window is symmetric)`, async () => {
      const possibleDuplicateOf = await runBtcDedupExtract({ dayOffset: -DUPLICATE_DATE_WINDOW_DAYS });
      expect(possibleDuplicateOf).not.toBeNull();
    });

    it('flags a duplicate when the imported row is just 1 day off (regression for the original bug)', async () => {
      const possibleDuplicateOf = await runBtcDedupExtract({ dayOffset: 1 });
      expect(possibleDuplicateOf).not.toBeNull();
    });

    it(`does NOT flag a duplicate when the imported row is DUPLICATE_DATE_WINDOW_DAYS + 1 (${DUPLICATE_DATE_WINDOW_DAYS + 1}) days apart`, async () => {
      const possibleDuplicateOf = await runBtcDedupExtract({ dayOffset: DUPLICATE_DATE_WINDOW_DAYS + 1 });
      expect(possibleDuplicateOf).toBeNull();
    });

    it('does NOT flag a duplicate when price differs (even with same amount + date in window)', async () => {
      // Existing: 0.05 @ 42000 → amount 2100. Imported: 0.1 @ 21000 → amount 2100
      // (same total cash, different unit price). Imported date sits at the
      // window boundary to also assert the price-strictness inside the window.
      const possibleDuplicateOf = await runBtcDedupExtract({
        dayOffset: DUPLICATE_DATE_WINDOW_DAYS,
        importedQuantity: '0.1',
        importedPrice: '21000',
      });
      expect(possibleDuplicateOf).toBeNull();
    });
  });

  describe('estimate-cost', () => {
    it('returns a cost estimate for a valid file (no assetClass needed)', async () => {
      const estimate = await helpers.investmentImportEstimateCost({
        payload: {
          fileBase64: encodeFile({
            text: 'Coinbase export\nBTC,2024-01-15,B,0.05,42000,USDT\nAAPL,2024-05-01,B,10,180.25,USD',
          }),
        },
        raw: true,
      });

      expect(estimate.estimatedInputTokens).toBeGreaterThan(0);
      expect(estimate.estimatedOutputTokens).toBeGreaterThan(0);
      expect(estimate.modelId).toBeTruthy();
    });
  });

  describe('execute', () => {
    it('creates a new security, holding, and child transactions for an unresolved AI batch the user then resolved', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Crypto' }),
        raw: true,
      });

      const result = await helpers.investmentImportExecute({
        payload: {
          holdings: [
            {
              tempId: 'holding-1',
              parsedSymbol: 'SOL',
              parsedName: 'Solana',
              resolvedSecurity: {
                securityId: null,
                providerSymbol: 'solana',
                symbol: 'SOL',
                name: 'Solana',
                assetClass: ASSET_CLASS.crypto,
                providerName: SECURITY_PROVIDER.coingecko,
                currencyCode: 'USD',
                cryptoCurrencyCode: 'SOL',
                exchangeName: 'CoinGecko',
                alreadyInDb: false,
              },
              resolvedConfidence: 'auto',
              portfolioId: portfolio.id,
              currencyCode: 'USD',
              hasExistingHolding: false,
              transactions: [
                {
                  tempId: 'tx-1',
                  date: '2024-04-01',
                  side: 'buy',
                  quantity: '10',
                  price: '95.5',
                  fees: '0',
                  amount: '955',
                  possibleDuplicateOf: null,
                },
                {
                  tempId: 'tx-2',
                  date: '2024-04-15',
                  side: 'sell',
                  quantity: '2',
                  price: '120',
                  fees: '0',
                  amount: '240',
                  possibleDuplicateOf: null,
                },
              ],
            },
          ],
          skipTempIds: [],
        },
        raw: true,
      });

      expect(result.createdSecurities).toBe(1);
      expect(result.createdHoldings).toBe(1);
      expect(result.mergedHoldings).toBe(0);
      expect(result.createdTransactions).toBe(2);

      // Verify the new security
      const sol = await Securities.findOne({ where: { providerSymbol: 'solana' } });
      expect(sol).toBeTruthy();
      expect(sol!.providerName).toBe(SECURITY_PROVIDER.coingecko);
      expect(sol!.assetClass).toBe(ASSET_CLASS.crypto);

      // Verify both transactions
      const txs = await InvestmentTransaction.findAll({ where: { securityId: sol!.id } });
      expect(txs).toHaveLength(2);
    });

    it('merges new transactions into an existing holding', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Crypto' }),
        raw: true,
      });

      const [btc] = await helpers.seedSecurities([{ symbol: 'BTC', name: 'Bitcoin' }]);
      await helpers.createHolding({
        payload: { portfolioId: portfolio.id, securityId: btc!.id },
      });
      // Pre-existing transaction (will not be touched).
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: portfolio.id,
          securityId: btc!.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          date: '2024-01-01',
          quantity: '0.1',
          price: '40000',
        },
      });

      const result = await helpers.investmentImportExecute({
        payload: {
          holdings: [
            {
              tempId: 'holding-1',
              parsedSymbol: 'BTC',
              parsedName: 'Bitcoin',
              resolvedSecurity: {
                securityId: btc!.id,
                providerSymbol: btc!.providerSymbol,
                symbol: 'BTC',
                name: 'Bitcoin',
                assetClass: btc!.assetClass,
                providerName: btc!.providerName,
                currencyCode: btc!.currencyCode,
                exchangeName: btc!.exchangeName ?? undefined,
                cryptoCurrencyCode: btc!.cryptoCurrencyCode ?? undefined,
                alreadyInDb: true,
              },
              resolvedConfidence: 'auto',
              portfolioId: portfolio.id,
              currencyCode: btc!.currencyCode,
              hasExistingHolding: false,
              transactions: [
                {
                  tempId: 'tx-1',
                  date: '2024-02-01',
                  side: 'buy',
                  quantity: '0.05',
                  price: '45000',
                  fees: '0',
                  amount: '2250',
                  possibleDuplicateOf: null,
                },
              ],
            },
          ],
          skipTempIds: [],
        },
        raw: true,
      });

      expect(result.createdSecurities).toBe(0);
      expect(result.createdHoldings).toBe(0);
      expect(result.mergedHoldings).toBe(1);
      expect(result.createdTransactions).toBe(1);

      // Original transaction should still be there.
      const txs = await InvestmentTransaction.findAll({ where: { securityId: btc!.id }, order: [['date', 'ASC']] });
      expect(txs).toHaveLength(2);
    });

    it('skips transactions that the user marked as duplicates via skipTempIds', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Crypto' }),
        raw: true,
      });

      const [btc] = await helpers.seedSecurities([{ symbol: 'BTC', name: 'Bitcoin' }]);

      const result = await helpers.investmentImportExecute({
        payload: {
          holdings: [
            {
              tempId: 'h-1',
              parsedSymbol: 'BTC',
              parsedName: 'Bitcoin',
              resolvedSecurity: {
                securityId: btc!.id,
                providerSymbol: btc!.providerSymbol,
                symbol: 'BTC',
                name: 'Bitcoin',
                assetClass: btc!.assetClass,
                providerName: btc!.providerName,
                currencyCode: btc!.currencyCode,
                exchangeName: btc!.exchangeName ?? undefined,
                cryptoCurrencyCode: btc!.cryptoCurrencyCode ?? undefined,
                alreadyInDb: true,
              },
              resolvedConfidence: 'auto',
              portfolioId: portfolio.id,
              currencyCode: btc!.currencyCode,
              hasExistingHolding: false,
              transactions: [
                {
                  tempId: 'keep',
                  date: '2024-01-15',
                  side: 'buy',
                  quantity: '0.1',
                  price: '42000',
                  fees: '0',
                  amount: '4200',
                  possibleDuplicateOf: null,
                },
                {
                  tempId: 'skip-me',
                  date: '2024-01-16',
                  side: 'buy',
                  quantity: '0.1',
                  price: '42000',
                  fees: '0',
                  amount: '4200',
                  possibleDuplicateOf: 'whatever',
                },
              ],
            },
          ],
          skipTempIds: ['skip-me'],
        },
        raw: true,
      });

      expect(result.createdTransactions).toBe(1);
      expect(result.skippedPossibleDuplicates).toBe(1);
    });

    it('rejects requests with no resolved security on a row', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Crypto' }),
        raw: true,
      });

      const response = await helpers.investmentImportExecute({
        payload: {
          holdings: [
            {
              tempId: 'h-1',
              parsedSymbol: 'BTC',
              parsedName: null,
              resolvedSecurity: null,
              resolvedConfidence: 'unmapped',
              portfolioId: portfolio.id,
              currencyCode: 'USD',
              hasExistingHolding: false,
              transactions: [
                {
                  tempId: 'tx-1',
                  date: '2024-01-15',
                  side: 'buy',
                  quantity: '0.1',
                  price: '42000',
                  fees: '0',
                  amount: '4200',
                  possibleDuplicateOf: null,
                },
              ],
            },
          ],
          skipTempIds: [],
        },
      });

      expect(response.statusCode).not.toBe(200);
    });

    it('rejects requests with a missing currencyCode on a row', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Crypto' }),
        raw: true,
      });

      const [btc] = await helpers.seedSecurities([{ symbol: 'BTC', name: 'Bitcoin' }]);

      const response = await helpers.investmentImportExecute({
        payload: {
          holdings: [
            {
              tempId: 'h-1',
              parsedSymbol: 'BTC',
              parsedName: null,
              resolvedSecurity: {
                securityId: btc!.id,
                providerSymbol: btc!.providerSymbol,
                symbol: 'BTC',
                name: 'Bitcoin',
                assetClass: btc!.assetClass,
                providerName: btc!.providerName,
                currencyCode: btc!.currencyCode,
                exchangeName: btc!.exchangeName ?? undefined,
                cryptoCurrencyCode: btc!.cryptoCurrencyCode ?? undefined,
                alreadyInDb: true,
              },
              resolvedConfidence: 'auto',
              portfolioId: portfolio.id,
              currencyCode: null,
              hasExistingHolding: false,
              transactions: [
                {
                  tempId: 'tx-1',
                  date: '2024-01-15',
                  side: 'buy',
                  quantity: '0.1',
                  price: '42000',
                  fees: '0',
                  amount: '4200',
                  possibleDuplicateOf: null,
                },
              ],
            },
          ],
          skipTempIds: [],
        },
      });

      expect(response.statusCode).not.toBe(200);
    });

    it('surfaces a warning and skippedHoldings count when the portfolio is unknown', async () => {
      // Create one portfolio that belongs to the test user, then send a holding
      // pointing at a *different* portfolioId (a real UUID that's not theirs).
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Crypto' }),
        raw: true,
      });
      void portfolio;

      const [btc] = await helpers.seedSecurities([{ symbol: 'BTC', name: 'Bitcoin' }]);

      const fakePortfolioId = '00000000-0000-0000-0000-000000000000';

      const result = await helpers.investmentImportExecute({
        payload: {
          holdings: [
            {
              tempId: 'h-1',
              parsedSymbol: 'BTC',
              parsedName: null,
              resolvedSecurity: {
                securityId: btc!.id,
                providerSymbol: btc!.providerSymbol,
                symbol: 'BTC',
                name: 'Bitcoin',
                assetClass: btc!.assetClass,
                providerName: btc!.providerName,
                currencyCode: btc!.currencyCode,
                exchangeName: btc!.exchangeName ?? undefined,
                cryptoCurrencyCode: btc!.cryptoCurrencyCode ?? undefined,
                alreadyInDb: true,
              },
              resolvedConfidence: 'auto',
              portfolioId: fakePortfolioId,
              currencyCode: btc!.currencyCode,
              hasExistingHolding: false,
              transactions: [
                {
                  tempId: 'tx-1',
                  date: '2024-01-15',
                  side: 'buy',
                  quantity: '0.1',
                  price: '42000',
                  fees: '0',
                  amount: '4200',
                  possibleDuplicateOf: null,
                },
              ],
            },
          ],
          skipTempIds: [],
        },
        raw: true,
      });

      expect(result.createdTransactions).toBe(0);
      expect(result.skippedHoldings).toBe(1);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('rejects requests where two rows pick the same security', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Crypto' }),
        raw: true,
      });

      const [btc] = await helpers.seedSecurities([{ symbol: 'BTC', name: 'Bitcoin' }]);

      const baseHolding = {
        parsedSymbol: 'BTC',
        parsedName: 'Bitcoin',
        resolvedSecurity: {
          securityId: btc!.id,
          providerSymbol: btc!.providerSymbol,
          symbol: 'BTC',
          name: 'Bitcoin',
          assetClass: btc!.assetClass,
          providerName: btc!.providerName,
          currencyCode: btc!.currencyCode,
          exchangeName: btc!.exchangeName ?? undefined,
          cryptoCurrencyCode: btc!.cryptoCurrencyCode ?? undefined,
          alreadyInDb: true,
        },
        resolvedConfidence: 'auto' as const,
        portfolioId: portfolio.id,
        currencyCode: btc!.currencyCode,
        hasExistingHolding: false,
        transactions: [
          {
            tempId: 'tx',
            date: '2024-01-15',
            side: 'buy' as const,
            quantity: '0.1',
            price: '42000',
            fees: '0',
            amount: '4200',
            possibleDuplicateOf: null,
          },
        ],
      };

      const response = await helpers.investmentImportExecute({
        payload: {
          holdings: [
            { tempId: 'h-1', ...baseHolding, transactions: [{ ...baseHolding.transactions[0]!, tempId: 'tx-1' }] },
            { tempId: 'h-2', ...baseHolding, transactions: [{ ...baseHolding.transactions[0]!, tempId: 'tx-2' }] },
          ],
          skipTempIds: [],
        },
      });

      expect(response.statusCode).not.toBe(200);
    });
  });
});
