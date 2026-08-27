import { ASSET_CLASS, SECURITY_PROVIDER } from '@bt/shared/types/investments';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { connection } from '@models/index';
import Securities from '@models/investments/securities.model';
import SecurityPricing from '@models/investments/security-pricing.model';
import { makeAuthRequest } from '@tests/helpers';
import { subDays, subHours } from 'date-fns';

/**
 * `Securities` and `SecurityPricings` are global tables with no user scoping, so
 * anything the demo seeder writes there is read by every user on the instance.
 * These tests pin the boundary: the demo may only write prices for a security
 * nobody has ever priced, and it must never fork a second row for a symbol that
 * already exists under a different provider.
 */

/** Price the fixtures plant so an assertion can tell it apart from any demo constant. */
const PLANTED_BTC_PRICE = 12_345.67;

/** The demo's hardcoded bitcoin price — the value that leaked into real accounts. */
const DEMO_BTC_PRICE = 67_500;

async function startDemo(): Promise<void> {
  const originalCookies = global.APP_AUTH_COOKIES;
  global.APP_AUTH_COOKIES = null;

  try {
    const res = await makeAuthRequest({ method: 'post', url: '/demo' });

    if (res.statusCode !== 200) {
      throw new Error(`Failed to create demo user: ${JSON.stringify(res.body)}`);
    }
  } finally {
    global.APP_AUTH_COOKIES = originalCookies;
  }
}

/** Mirrors the row a real CoinGecko sync would leave behind for bitcoin. */
async function plantRealBitcoin({ historyDays }: { historyDays: number }): Promise<Securities> {
  const security = await Securities.create({
    symbol: 'BTC',
    providerSymbol: 'bitcoin',
    name: 'Bitcoin',
    assetClass: ASSET_CLASS.crypto,
    currencyCode: 'USD',
    cryptoCurrencyCode: 'BTC',
    providerName: SECURITY_PROVIDER.coingecko,
    exchangeName: 'CoinGecko',
    pricingLastSyncedAt: new Date(),
    isBrokerageCash: false,
  });

  const now = new Date();
  const rows = [
    // Oldest row bounds the coverage window the demo has to fit its purchase into.
    {
      securityId: security.id,
      date: subDays(now, historyDays),
      priceClose: '30000',
      source: SECURITY_PROVIDER.coingecko,
    },
    // Newest row is what every "latest price" read must keep returning.
    {
      securityId: security.id,
      date: subHours(now, 1),
      priceClose: String(PLANTED_BTC_PRICE),
      source: SECURITY_PROVIDER.coingecko,
    },
  ];

  await SecurityPricing.bulkCreate(rows);

  return security;
}

async function countDemoPriceRows({ securityId }: { securityId: string }): Promise<number> {
  return SecurityPricing.count({ where: { securityId, source: 'demo' } });
}

async function latestPrice({ securityId }: { securityId: string }): Promise<number> {
  const row = await SecurityPricing.findOne({
    where: { securityId },
    order: [['date', 'DESC']],
  });

  if (!row) throw new Error(`No price rows for security ${securityId}`);

  return row.priceClose.toNumber();
}

describe('Demo seeding does not pollute global price data', () => {
  let originalAuthCookies: string | null;

  beforeEach(() => {
    originalAuthCookies = global.APP_AUTH_COOKIES;
  });

  afterEach(() => {
    global.APP_AUTH_COOKIES = originalAuthCookies;
  });

  it('reuses existing security rows, writes no prices for them and leaves their real latest price intact', async () => {
    const bitcoin = await plantRealBitcoin({ historyDays: 400 });

    await Securities.create({
      symbol: 'AAPL',
      providerSymbol: 'AAPL',
      name: 'Apple Inc.',
      assetClass: ASSET_CLASS.stocks,
      currencyCode: 'USD',
      // A real instance may hold AAPL under any provider; the demo hardcodes yahoo.
      providerName: SECURITY_PROVIDER.fmp,
      exchangeAcronym: 'NASDAQ',
      isBrokerageCash: false,
    });

    await startDemo();

    expect(await countDemoPriceRows({ securityId: bitcoin.id })).toBe(0);

    // The reported bug: the demo's row was newer, so MAX(date) returned 67500
    // for every user holding bitcoin.
    const price = await latestPrice({ securityId: bitcoin.id });
    expect(price).not.toBeCloseTo(DEMO_BTC_PRICE, 2);
    expect(price).toBeCloseTo(PLANTED_BTC_PRICE, 2);

    const bitcoinRows = await Securities.count({ where: { providerSymbol: 'bitcoin' } });
    expect(bitcoinRows).toBe(1);

    const appleRows = await Securities.count({ where: { symbol: 'AAPL', currencyCode: 'USD' } });
    expect(appleRows).toBe(1);
  });

  it('still seeds a price series for securities nobody has ever priced', async () => {
    // The fallback that keeps a fresh install's demo usable: with no real prices
    // on the instance there is no one to mislead, so synthetic history is safe.
    await startDemo();

    const [rows] = await connection.sequelize.query(
      `SELECT sp."securityId", COUNT(*) AS "rowCount"
         FROM "SecurityPricings" sp
        GROUP BY sp."securityId"`,
    );

    const series = rows as { securityId: string; rowCount: string }[];
    expect(series.length).toBe(6);

    for (const row of series) {
      expect(Number(row.rowCount)).toBeGreaterThan(1);
    }
  });

  it('prices demo holdings from the real series when one exists', async () => {
    // Coverage shorter than the demo's configured 820-day bitcoin purchase, so
    // the buy has to be pulled forward onto a day that actually has a price.
    await plantRealBitcoin({ historyDays: 200 });

    await startDemo();

    const [rows] = await connection.sequelize.query(
      `SELECT it."date", it."price"
         FROM "InvestmentTransactions" it
         JOIN "Securities" s ON s.id = it."securityId"
        WHERE s."providerSymbol" = 'bitcoin'`,
    );

    const buys = rows as { date: string; price: string }[];
    expect(buys.length).toBe(1);

    const buyDate = new Date(buys[0]!.date);
    const oldestCovered = subDays(new Date(), 201);
    expect(buyDate.getTime()).toBeGreaterThan(oldestCovered.getTime());

    // Cost basis comes off a real row, not the hardcoded $42,000 purchase price.
    expect(Number(buys[0]!.price)).toBe(30000);
  });
});
