import { ACCOUNT_TYPES, PAYMENT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import {
  ASSET_CLASS,
  INVESTMENT_TRANSACTION_CATEGORY,
  PORTFOLIO_TYPE,
  SECURITY_PROVIDER,
} from '@bt/shared/types/investments';
import { logger } from '@js/utils/logger';
import { connection } from '@models/index';
import Holdings from '@models/investments/holdings.model';
import InvestmentTransaction from '@models/investments/investment-transaction.model';
import PortfolioBalances from '@models/investments/portfolio-balances.model';
import PortfolioTransfers from '@models/investments/portfolio-transfers.model';
import Portfolios from '@models/investments/portfolios.model';
import Securities from '@models/investments/securities.model';
import SecurityPricing from '@models/investments/security-pricing.model';
import Transactions from '@models/transactions.model';
import { Big } from 'big.js';
import { addMonths, format, subDays } from 'date-fns';
import { type Transaction } from 'sequelize';
import { v7 as uuidv7 } from 'uuid';

import { DEMO_CONFIG } from './demo-config';

interface DemoSecurityConfig {
  symbol: string;
  providerSymbol: string;
  name: string;
  assetClass: ASSET_CLASS;
  providerName: SECURITY_PROVIDER;
  currencyCode: string;
  cryptoCurrencyCode?: string | null;
  exchangeAcronym?: string | null;
  exchangeMic?: string | null;
  exchangeName?: string | null;
  /**
   * Logo shown in the holdings UI. Stocks leave this null and the frontend
   * derives a logo.dev URL from the ticker (needs VITE_LOGO_DEV_TOKEN); crypto
   * stores the CoinGecko CDN URL the live sync would produce, so demo crypto
   * logos render even without a logo.dev token configured.
   */
  logoUrl?: string | null;
  currentPrice: number;
  purchasePrice: number;
  quantity: number;
  purchaseDaysAgo: number;
}

const DEMO_SECURITIES: DemoSecurityConfig[] = [
  {
    symbol: 'AAPL',
    providerSymbol: 'AAPL',
    name: 'Apple Inc.',
    assetClass: ASSET_CLASS.stocks,
    providerName: SECURITY_PROVIDER.yahoo,
    currencyCode: 'USD',
    exchangeAcronym: 'NASDAQ',
    exchangeMic: 'XNAS',
    exchangeName: 'NASDAQ',
    currentPrice: 185.5,
    purchasePrice: 150.0,
    quantity: 10,
    purchaseDaysAgo: 640,
  },
  {
    symbol: 'VOO',
    providerSymbol: 'VOO',
    name: 'Vanguard S&P 500 ETF',
    assetClass: ASSET_CLASS.stocks,
    providerName: SECURITY_PROVIDER.yahoo,
    currencyCode: 'USD',
    exchangeAcronym: 'NYSEARCA',
    exchangeMic: 'ARCX',
    exchangeName: 'NYSE Arca',
    currentPrice: 480.25,
    purchasePrice: 410.0,
    quantity: 5,
    purchaseDaysAgo: 900,
  },
  {
    symbol: 'MSFT',
    providerSymbol: 'MSFT',
    name: 'Microsoft Corporation',
    assetClass: ASSET_CLASS.stocks,
    providerName: SECURITY_PROVIDER.yahoo,
    currencyCode: 'USD',
    exchangeAcronym: 'NASDAQ',
    exchangeMic: 'XNAS',
    exchangeName: 'NASDAQ',
    currentPrice: 415.75,
    purchasePrice: 370.0,
    quantity: 8,
    purchaseDaysAgo: 420,
  },
];

// CoinGecko-sourced crypto holdings. `providerSymbol` is the CoinGecko coin id
// (what the price-sync pipeline queries), while `symbol`/`cryptoCurrencyCode`
// hold the ticker. Shape mirrors `coingecko-provider.ts` so the demo holdings
// are indistinguishable from a real synced crypto security.
const DEMO_CRYPTO: DemoSecurityConfig[] = [
  {
    symbol: 'BTC',
    providerSymbol: 'bitcoin',
    name: 'Bitcoin',
    assetClass: ASSET_CLASS.crypto,
    providerName: SECURITY_PROVIDER.coingecko,
    currencyCode: 'USD',
    cryptoCurrencyCode: 'BTC',
    exchangeName: 'CoinGecko',
    logoUrl: 'https://coin-images.coingecko.com/coins/images/1/small/bitcoin.png',
    currentPrice: 67500,
    purchasePrice: 42000,
    quantity: 0.15,
    purchaseDaysAgo: 820,
  },
  {
    symbol: 'ETH',
    providerSymbol: 'ethereum',
    name: 'Ethereum',
    assetClass: ASSET_CLASS.crypto,
    providerName: SECURITY_PROVIDER.coingecko,
    currencyCode: 'USD',
    cryptoCurrencyCode: 'ETH',
    exchangeName: 'CoinGecko',
    logoUrl: 'https://coin-images.coingecko.com/coins/images/279/small/ethereum.png',
    currentPrice: 3500,
    purchasePrice: 2400,
    quantity: 2,
    purchaseDaysAgo: 560,
  },
  {
    symbol: 'SOL',
    providerSymbol: 'solana',
    name: 'Solana',
    assetClass: ASSET_CLASS.crypto,
    providerName: SECURITY_PROVIDER.coingecko,
    currencyCode: 'USD',
    cryptoCurrencyCode: 'SOL',
    exchangeName: 'CoinGecko',
    logoUrl: 'https://coin-images.coingecko.com/coins/images/4128/small/solana.png',
    currentPrice: 145,
    purchasePrice: 95,
    quantity: 25,
    purchaseDaysAgo: 300,
  },
];

const DEMO_INVESTMENT_STARTING_CASH = 5000;
const DEMO_CRYPTO_STARTING_CASH = 1500;

interface DemoContributionConfig {
  /** Days before the reference date the cash left the savings account. */
  daysAgo: number;
  /**
   * Whole-dollar amount, or `null` for "whatever is still missing". Exactly one
   * entry per portfolio may be null: it absorbs the difference so the funding
   * always adds up to the buys plus the ending cash balance.
   */
  amount: number | null;
  description: string;
}

interface DemoPortfolioPlan {
  name: string;
  description: string;
  securities: DemoSecurityConfig[];
  /** Cash left sitting in the portfolio after every buy has settled. */
  endingCash: number;
  contributions: DemoContributionConfig[];
}

// Each portfolio's funding lands a few weeks ahead of the buy it pays for, so the
// cash balance never dips below zero when the trades are replayed in date order.
const DEMO_PORTFOLIO_PLANS: DemoPortfolioPlan[] = [
  {
    name: 'Growth Portfolio',
    description: 'Demo portfolio of US equities and ETFs',
    securities: DEMO_SECURITIES,
    endingCash: DEMO_INVESTMENT_STARTING_CASH,
    contributions: [
      { daysAgo: 950, amount: 2500, description: 'Brokerage account funding' },
      { daysAgo: 700, amount: 2000, description: 'Monthly investing transfer' },
      { daysAgo: 500, amount: 3000, description: 'Monthly investing transfer' },
      { daysAgo: 300, amount: 2000, description: 'Monthly investing transfer' },
      { daysAgo: 120, amount: null, description: 'Brokerage top-up' },
    ],
  },
  {
    name: 'Crypto Portfolio',
    description: 'Demo portfolio of crypto holdings',
    securities: DEMO_CRYPTO,
    endingCash: DEMO_CRYPTO_STARTING_CASH,
    contributions: [
      { daysAgo: 860, amount: 6500, description: 'Crypto exchange funding' },
      { daysAgo: 600, amount: 5000, description: 'Crypto exchange funding' },
      { daysAgo: 350, amount: 2500, description: 'Monthly crypto transfer' },
      { daysAgo: 180, amount: 500, description: 'Monthly crypto transfer' },
      { daysAgo: 60, amount: null, description: 'Crypto exchange top-up' },
    ],
  },
];

/** Fraction of the trend price the monthly wobble may swing, per asset class. */
const STOCK_VOLATILITY = 0.06;
const CRYPTO_VOLATILITY = 0.22;

/** Floor so a wide swing can never produce a zero or negative price. */
const MIN_PRICE = 0.0001;

/**
 * FNV-1a hash. The price path has to be reproducible per demo user and must not
 * consume faker's seeded global state, so the wobble is derived from the symbol
 * and month index rather than any RNG.
 */
function hashSeed({ seed }: { seed: string }): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  // FNV alone barely changes its high bits when only the last character differs,
  // and those are the bits the wobble reads. This finalizer spreads them so
  // consecutive months get genuinely different offsets.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** Deterministic value in [-1, 1) for a seed string. */
function wobble({ seed }: { seed: string }): number {
  return (hashSeed({ seed }) / 0x100000000) * 2 - 1;
}

// A type alias, not an interface: `bulkCreate` takes an index-signature type and
// only aliases get the implicit index signature that satisfies it.
type SecurityPricingRow = {
  securityId: string;
  date: Date;
  priceClose: string;
  priceAsOf: Date;
  source: string;
};

/**
 * Monthly price rows from the purchase date through the reference date. The
 * price lookup binary-searches for the latest row on or before a bucket date, so
 * monthly coverage is enough to make historical net worth track the market
 * instead of falling back to cost basis.
 *
 * The path interpolates purchase price -> current price and adds a wobble tapered
 * to zero at both ends, which keeps the first row at the exact purchase price and
 * the last row at the exact price the holdings UI shows.
 */
function buildPriceHistory({
  securityId,
  config,
  purchaseDate,
  referenceDate,
}: {
  securityId: string;
  config: DemoSecurityConfig;
  purchaseDate: Date;
  referenceDate: Date;
}): SecurityPricingRow[] {
  const dates: Date[] = [];
  let cursor = purchaseDate;
  while (cursor < referenceDate) {
    dates.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  dates.push(referenceDate);

  const lastIndex = dates.length - 1;
  const volatility = config.assetClass === ASSET_CLASS.crypto ? CRYPTO_VOLATILITY : STOCK_VOLATILITY;

  return dates.map((date, index) => {
    let price: number;
    if (index === lastIndex) {
      price = config.currentPrice;
    } else if (index === 0) {
      price = config.purchasePrice;
    } else {
      const progress = index / lastIndex;
      const trend = config.purchasePrice + (config.currentPrice - config.purchasePrice) * progress;
      const swing = Math.sin(Math.PI * progress) * volatility * wobble({ seed: `${config.symbol}:${index}` });
      price = Math.max(trend * (1 + swing), MIN_PRICE);
    }

    return {
      securityId,
      date,
      priceClose: new Big(price).toFixed(10),
      priceAsOf: date,
      source: 'demo',
    };
  });
}

/** Whole cents for a decimal dollar amount. */
function toCents({ amount }: { amount: Big }): number {
  return Number(amount.times(100).round(0).toFixed(0));
}

/**
 * Seeds securities, monthly price history, holdings and the opening buy
 * transaction for a single portfolio. Shared by the stock and crypto portfolios
 * so both asset classes follow the exact same holding-creation path.
 */
async function seedPortfolioHoldings({
  portfolioId,
  securities,
  referenceDate,
  transaction,
}: {
  portfolioId: string;
  securities: DemoSecurityConfig[];
  referenceDate: Date;
  transaction: Transaction;
}): Promise<void> {
  const pricingRows: SecurityPricingRow[] = [];

  for (const sec of securities) {
    const [security, created] = await Securities.findOrCreate({
      where: {
        providerName: sec.providerName,
        providerSymbol: sec.providerSymbol,
      },
      defaults: {
        symbol: sec.symbol,
        providerSymbol: sec.providerSymbol,
        name: sec.name,
        assetClass: sec.assetClass,
        currencyCode: sec.currencyCode,
        cryptoCurrencyCode: sec.cryptoCurrencyCode ?? null,
        providerName: sec.providerName,
        exchangeAcronym: sec.exchangeAcronym ?? null,
        exchangeMic: sec.exchangeMic ?? null,
        exchangeName: sec.exchangeName ?? null,
        logoUrl: sec.logoUrl ?? null,
        pricingLastSyncedAt: referenceDate,
        isBrokerageCash: false,
      },
      transaction,
    });

    // Securities is a shared reference table. If a row for the same symbol
    // already exists (e.g. seeded by a real user sync), findOrCreate silently
    // reuses it and `defaults` are not applied. Surface metadata drift so
    // demo inconsistencies are at least visible in logs.
    if (!created && security.exchangeMic !== (sec.exchangeMic ?? null)) {
      logger.warn(
        `Demo security ${sec.symbol}: existing exchangeMic=${security.exchangeMic} differs from demo config exchangeMic=${sec.exchangeMic}. Using existing row.`,
      );
    }

    const purchaseDate = subDays(referenceDate, sec.purchaseDaysAgo);
    pricingRows.push(
      ...buildPriceHistory({
        securityId: security.id,
        config: sec,
        purchaseDate,
        referenceDate,
      }),
    );

    const quantityStr = new Big(sec.quantity).toFixed(10);
    const costBasisStr = new Big(sec.purchasePrice).times(sec.quantity).toFixed(10);

    await Holdings.create(
      {
        portfolioId,
        securityId: security.id,
        currencyCode: sec.currencyCode,
        quantity: quantityStr,
        costBasis: costBasisStr,
        refCostBasis: costBasisStr,
        excluded: false,
      },
      { transaction },
    );

    await InvestmentTransaction.create(
      {
        portfolioId,
        securityId: security.id,
        transactionType: TRANSACTION_TYPES.expense,
        date: format(purchaseDate, 'yyyy-MM-dd'),
        name: `Bought ${sec.quantity} ${sec.symbol}`,
        amount: costBasisStr,
        refAmount: costBasisStr,
        fees: '0',
        refFees: '0',
        quantity: quantityStr,
        price: sec.purchasePrice.toFixed(10),
        refPrice: sec.purchasePrice.toFixed(10),
        currencyCode: sec.currencyCode,
        settlementCurrencyCode: sec.currencyCode,
        settlementAmount: costBasisStr,
        settlementFees: '0',
        settlementRate: '1',
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
      },
      { transaction },
    );
  }

  // A price row for the same security and day may already exist because
  // Securities is shared across users; keep whichever row got there first.
  await SecurityPricing.bulkCreate(pricingRows, {
    ignoreDuplicates: true,
    transaction,
  });
}

interface ContributionPlan {
  daysAgo: number;
  amount: Big;
  description: string;
}

/**
 * Resolves the placeholder entry so the portfolio's funding equals its buys plus
 * its ending cash. Without that equality the ending `PortfolioBalances` row would
 * contradict the transfers the contributions report sums.
 */
function resolveContributions({
  contributions,
  totalNeeded,
}: {
  contributions: DemoContributionConfig[];
  totalNeeded: Big;
}): ContributionPlan[] {
  const fixedTotal = contributions.reduce(
    (sum, item) => (item.amount === null ? sum : sum.plus(item.amount)),
    new Big(0),
  );
  const remainder = totalNeeded.minus(fixedTotal);

  if (remainder.lte(0)) {
    throw new Error(
      `Demo investments: fixed contributions (${fixedTotal.toString()}) exceed the funding needed (${totalNeeded.toString()})`,
    );
  }

  return contributions.map((item) => ({
    daysAgo: item.daysAgo,
    amount: item.amount === null ? remainder : new Big(item.amount),
    description: item.description,
  }));
}

/**
 * Money moving from the savings account into a portfolio: an expense on the
 * account plus the PortfolioTransfers row, which is the only table the
 * Investment Contributions report reads.
 */
async function seedPortfolioFunding({
  userId,
  portfolioId,
  portfolioName,
  savingsAccountId,
  contributions,
  referenceDate,
  transaction,
}: {
  userId: number;
  portfolioId: string;
  portfolioName: string;
  savingsAccountId: string;
  contributions: ContributionPlan[];
  referenceDate: Date;
  transaction: Transaction;
}): Promise<void> {
  const currencyCode = DEMO_CONFIG.baseCurrency;

  const planned = contributions.map((item) => {
    const time = subDays(referenceDate, item.daysAgo);
    return {
      transactionId: uuidv7(),
      time,
      amountCents: toCents({ amount: item.amount }),
      amountDecimal: item.amount.toFixed(10),
      description: `${item.description} (${portfolioName})`,
    };
  });

  // Hooks stay off: the orchestrator recomputes account balances and history with
  // raw SQL once every demo transaction is in place.
  await Transactions.bulkCreate(
    planned.map((item) => ({
      id: item.transactionId,
      userId,
      amount: item.amountCents,
      refAmount: item.amountCents,
      transactionType: TRANSACTION_TYPES.expense,
      paymentType: PAYMENT_TYPES.bankTransfer,
      accountId: savingsAccountId,
      accountType: ACCOUNT_TYPES.system,
      categoryId: null,
      currencyCode,
      refCurrencyCode: currencyCode,
      // Account -> portfolio funding is single-leg, so there is no `transferId`
      // pairing this row with a counterpart transaction.
      transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio,
      note: item.description,
      time: item.time,
      commissionRate: 0,
      refCommissionRate: 0,
      cashbackAmount: 0,
      refundLinked: false,
    })),
    { hooks: false, validate: false, transaction },
  );

  // `fromPortfolioId`/`toAccountId` stay null: the report counts a row as an
  // inbound contribution only when the portfolio is the destination and no
  // portfolio is the source.
  await PortfolioTransfers.bulkCreate(
    planned.map((item) => ({
      userId,
      fromAccountId: savingsAccountId,
      toPortfolioId: portfolioId,
      fromPortfolioId: null,
      toAccountId: null,
      amount: item.amountDecimal,
      refAmount: item.amountDecimal,
      currencyCode,
      date: format(item.time, 'yyyy-MM-dd'),
      description: item.description,
      transactionId: item.transactionId,
    })),
    { transaction },
  );
}

export async function setupInvestments({
  userId,
  referenceDate,
  savingsAccountId,
}: {
  userId: number;
  referenceDate: Date;
  savingsAccountId: string;
}): Promise<void> {
  const transaction = await connection.sequelize.transaction();

  try {
    for (const plan of DEMO_PORTFOLIO_PLANS) {
      const portfolio = await Portfolios.create(
        {
          userId,
          name: plan.name,
          portfolioType: PORTFOLIO_TYPE.investment,
          description: plan.description,
          isEnabled: true,
        },
        { transaction },
      );

      await seedPortfolioHoldings({
        portfolioId: portfolio.id,
        securities: plan.securities,
        referenceDate,
        transaction,
      });

      const totalBuyCost = plan.securities.reduce(
        (sum, sec) => sum.plus(new Big(sec.purchasePrice).times(sec.quantity)),
        new Big(0),
      );
      const contributions = resolveContributions({
        contributions: plan.contributions,
        totalNeeded: totalBuyCost.plus(plan.endingCash),
      });

      await seedPortfolioFunding({
        userId,
        portfolioId: portfolio.id,
        portfolioName: plan.name,
        savingsAccountId,
        contributions,
        referenceDate,
        transaction,
      });

      // Written directly rather than through the transfer service, whose balance
      // updates are additive and would double-count against these rows.
      const endingCash = contributions
        .reduce((sum, item) => sum.plus(item.amount), new Big(0))
        .minus(totalBuyCost)
        .toFixed(10);

      // Demo base currency is USD, so ref amounts mirror direct amounts 1:1.
      await PortfolioBalances.create(
        {
          portfolioId: portfolio.id,
          currencyCode: DEMO_CONFIG.baseCurrency,
          availableCash: endingCash,
          totalCash: endingCash,
          refAvailableCash: endingCash,
          refTotalCash: endingCash,
        },
        { transaction },
      );
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  logger.info(
    `Created demo portfolios (${DEMO_SECURITIES.length} stock + ${DEMO_CRYPTO.length} crypto holdings) for user ${userId}`,
  );
}
