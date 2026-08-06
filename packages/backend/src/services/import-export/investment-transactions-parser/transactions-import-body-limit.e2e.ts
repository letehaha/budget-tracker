import { INVESTMENT_TRANSACTION_CATEGORY, type InvestmentColumnMapping } from '@bt/shared/types/investments';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { VALID_GEMINI_API_KEY } from '@tests/mocks/gemini/mock-api';

/**
 * The default `express.json()` limit is 100KB. Both endpoints receive the whole
 * uploaded file as base64 (files up to 10MB are accepted), so the request body
 * must be allowed to grow well past that ceiling.
 */
const MIN_BODY_BYTES = 100 * 1024;

const ROW_COUNT = 300;

// Broker exports carry a free-text description column the user never maps.
// Padding it grows the file without inflating the parsed row count.
const DESCRIPTION_LENGTH = 300;
const DESCRIPTION_PADDING = 'TRADE CONFIRMATION SETTLED VIA CLEARING HOUSE '.repeat(8);

const CSV_HEADERS = 'Symbol,Date,Action,Quantity,Price,Description';

const SYMBOL = 'AAPL';

function buildOversizedCsv({ rowCount }: { rowCount: number }): string {
  const rows = Array.from({ length: rowCount }, (_, index) => {
    const day = String((index % 28) + 1).padStart(2, '0');
    const side = index % 3 === 0 ? 'SELL' : 'BUY';
    const description = `Order ${index} ${DESCRIPTION_PADDING}`.slice(0, DESCRIPTION_LENGTH);
    return `${SYMBOL},2024-03-${day},${side},${(index % 20) + 1},${180 + (index % 50)}.25,${description}`;
  });

  return [CSV_HEADERS, ...rows].join('\n');
}

function encode({ text }: { text: string }): string {
  return Buffer.from(text, 'utf-8').toString('base64');
}

const COLUMN_MAPPING: InvestmentColumnMapping = {
  symbol: 'Symbol',
  date: 'Date',
  side: 'Action',
  quantity: 'Quantity',
  price: 'Price',
  fees: null,
  currency: null,
  name: null,
  defaultCurrency: null,
  defaultAssetClassHint: 'stocks',
  sideValueMapping: {
    BUY: INVESTMENT_TRANSACTION_CATEGORY.buy,
    SELL: INVESTMENT_TRANSACTION_CATEGORY.sell,
  },
};

describe('Investment transactions import - request body size limit', () => {
  let originalGeminiKey: string | undefined;

  beforeEach(() => {
    originalGeminiKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = VALID_GEMINI_API_KEY;
  });

  afterEach(() => {
    if (originalGeminiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalGeminiKey;
    }
  });

  describe('POST /investments/transactions-import/estimate-cost', () => {
    it('accepts a base64 file larger than the default 100KB body limit', async () => {
      const payload = { fileBase64: encode({ text: buildOversizedCsv({ rowCount: ROW_COUNT }) }) };
      expect(Buffer.byteLength(JSON.stringify(payload))).toBeGreaterThan(MIN_BODY_BYTES);

      const response = await helpers.investmentImportEstimateCost({ payload });

      // A file the model can't fit still answers 200 with `success: false` in
      // the body, so the status alone is what proves the body was parsed.
      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /investments/transactions-import/extract', () => {
    it('accepts a base64 file larger than the default 100KB body limit', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Body limit' }),
        raw: true,
      });

      // Seeding the security + holding keeps symbol resolution on the
      // user-securities branch, so no provider lookup happens.
      const [aapl] = await helpers.seedSecurities([{ symbol: SYMBOL, name: 'Apple Inc.' }]);
      await helpers.createHolding({ payload: { portfolioId: portfolio.id, securityId: aapl!.id } });

      const payload = {
        source: 'csv' as const,
        fileBase64: encode({ text: buildOversizedCsv({ rowCount: ROW_COUNT }) }),
        defaultPortfolioId: portfolio.id,
        columnMapping: COLUMN_MAPPING,
      };
      expect(Buffer.byteLength(JSON.stringify(payload))).toBeGreaterThan(MIN_BODY_BYTES);

      const response = await helpers.investmentImportExtract({ payload });

      expect(response.statusCode).toBe(200);

      const { holdings } = response.body.response;
      expect(holdings).toHaveLength(1);
      expect(holdings[0]!.parsedSymbol).toBe(SYMBOL);
      expect(holdings[0]!.transactions).toHaveLength(ROW_COUNT);
    });
  });
});
