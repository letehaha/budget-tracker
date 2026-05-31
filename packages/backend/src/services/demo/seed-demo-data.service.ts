import type { RecordId } from '@bt/shared/types';
import {
  ACCOUNT_CATEGORIES,
  ACCOUNT_TYPES,
  BUDGET_STATUSES,
  DEPRECIATION_PRESET,
  SUBSCRIPTION_FREQUENCIES,
  TRANSACTION_TYPES,
  VEHICLE_CLASS,
} from '@bt/shared/types';
import {
  ASSET_CLASS,
  INVESTMENT_TRANSACTION_CATEGORY,
  PORTFOLIO_TYPE,
  SECURITY_PROVIDER,
} from '@bt/shared/types/investments';
import { VENTURE_CASH_FLOW_MODE, VENTURE_EVENT_TYPE, VENTURE_SPV_SUBTYPE } from '@bt/shared/types/venture';
import { getTranslatedCategories } from '@common/const/default-categories';
import { getTranslatedDefaultTags } from '@common/const/default-tags';
import { Money } from '@common/types/money';
import { logger } from '@js/utils/logger';
import Accounts from '@models/accounts.model';
import { connection } from '@models/index';
import Holdings from '@models/investments/holdings.model';
import InvestmentTransaction from '@models/investments/investment-transaction.model';
import PortfolioBalances from '@models/investments/portfolio-balances.model';
import Portfolios from '@models/investments/portfolios.model';
import Securities from '@models/investments/securities.model';
import SecurityPricing from '@models/investments/security-pricing.model';
import Subscriptions from '@models/subscriptions.model';
import UserSettings, { DEFAULT_SETTINGS, type SettingsSchema } from '@models/user-settings.model';
import * as UsersCurrencies from '@models/users-currencies.model';
import * as accountsService from '@services/accounts.service';
import { createBudget } from '@services/budgets/create-budget';
import * as categoriesService from '@services/categories.service';
import * as tagsService from '@services/tags';
import * as userService from '@services/user.service';
import { createVehicle } from '@services/vehicles/create-vehicle.service';
import { overrideVehicleValue } from '@services/vehicles/override-vehicle-value.service';
import { createVentureDeal } from '@services/venture/deals/create.service';
import { createVentureEvent } from '@services/venture/events/create.service';
import { createVenturePlatform } from '@services/venture/platforms/create.service';
import { Big } from 'big.js';
import { format, setDate, subDays, subMonths, subYears } from 'date-fns';
import { type Transaction } from 'sequelize';
import { v7 as uuidv7 } from 'uuid';

// Demo data configuration based on PRD
export const DEMO_CONFIG = {
  // Transaction history spans 2.5+ years (36 months to ensure tests always get >= 2 years)
  historyMonths: 36,
  baseCurrency: 'USD',
  currencies: ['USD', 'EUR', 'PLN'],
  exchangeRates: { EUR: 0.92, PLN: 4.0 } as Record<string, number>,
  accounts: [
    { name: 'Main Checking', currency: 'USD', type: ACCOUNT_CATEGORIES.currentAccount, initialBalance: 500000 }, // $5,000 in cents
    { name: 'Savings', currency: 'USD', type: ACCOUNT_CATEGORIES.saving, initialBalance: 1200000 }, // $12,000 in cents
    {
      name: 'Travel Card',
      currency: 'EUR',
      type: ACCOUNT_CATEGORIES.creditCard,
      initialBalance: 0,
      creditLimit: 300000,
    }, // €3,000 limit
    { name: 'Cash', currency: 'PLN', type: ACCOUNT_CATEGORIES.cash, initialBalance: 50000 }, // 500 PLN in cents
  ],
  budgets: [
    { name: 'Monthly Groceries', limitAmount: 50000, categoryKey: 'food' }, // $500 in cents
    { name: 'Entertainment & Life', limitAmount: 25000, categoryKey: 'life' }, // $250 in cents (life includes hobbies, events, etc.)
    { name: 'Dining Out', limitAmount: 35000, categoryKey: 'food' }, // $350 in cents
  ],
  subscriptions: [
    { name: 'Netflix', expectedAmount: 1599, dayOfMonth: 2, frequency: SUBSCRIPTION_FREQUENCIES.monthly },
    { name: 'Apple One', expectedAmount: 1995, dayOfMonth: 5, frequency: SUBSCRIPTION_FREQUENCIES.monthly },
    { name: 'Spotify', expectedAmount: 999, dayOfMonth: 8, frequency: SUBSCRIPTION_FREQUENCIES.monthly },
    { name: 'YouTube Premium', expectedAmount: 1399, dayOfMonth: 12, frequency: SUBSCRIPTION_FREQUENCIES.monthly },
    { name: 'Adobe Creative Cloud', expectedAmount: 5499, dayOfMonth: 15, frequency: SUBSCRIPTION_FREQUENCIES.monthly },
    { name: 'Amazon Prime', expectedAmount: 1499, dayOfMonth: 20, frequency: SUBSCRIPTION_FREQUENCIES.monthly },
    { name: 'ChatGPT Plus', expectedAmount: 2000, dayOfMonth: 25, frequency: SUBSCRIPTION_FREQUENCIES.monthly },
  ],
};

export async function setupCurrencies({ userId }: { userId: number }): Promise<void> {
  for (const currencyCode of DEMO_CONFIG.currencies) {
    const isBase = currencyCode === DEMO_CONFIG.baseCurrency;
    await UsersCurrencies.addCurrency({
      userId,
      currencyCode,
      exchangeRate: isBase ? 1 : (DEMO_CONFIG.exchangeRates[currencyCode] ?? 1),
      isDefaultCurrency: isBase,
      liveRateUpdate: true,
    });
  }
}

export async function createCategories({ userId }: { userId: number }): Promise<Map<string, string>> {
  const locale = 'en';
  const translatedCategories = getTranslatedCategories({ locale });

  // Create default categories
  const defaultCategories = translatedCategories.main.map((item) => ({
    name: item.name,
    type: item.type,
    color: item.color,
    key: item.key,
    userId,
  }));

  // The column allows NULL (user-created custom categories don't have a key), but the
  // seed path always should guard against future drift in `getTranslatedCategories`
  // that would silently produce keyless defaults. Log to Sentry in prod and continue;
  // throw in dev/test so bugs surface loudly during development.
  const mainMissingKey = defaultCategories.find((c) => !c.key);
  if (mainMissingKey) {
    const message = `Seed integrity bug: default category "${mainMissingKey.name}" is missing 'key'`;
    logger.error(message);
    if (process.env.NODE_ENV !== 'production') throw new Error(message);
  }

  const categories = await categoriesService.bulkCreate({ data: defaultCategories }, { returning: true });

  // Build map of category key -> id
  const categoryMap = new Map<string, RecordId>();
  translatedCategories.main.forEach((item, index) => {
    const createdCategory = categories[index];
    if (createdCategory) {
      categoryMap.set(item.key, createdCategory.id);
    }
  });

  // Create subcategories
  const subcats: Array<{
    name: string;
    parentId: string;
    color: string;
    userId: number;
    type: string;
    key: string;
  }> = [];

  translatedCategories.subcategories.forEach((subcat) => {
    const parentId = categoryMap.get(subcat.parentKey);
    const parentCategory = translatedCategories.main.find((c) => c.key === subcat.parentKey);

    if (parentId && parentCategory) {
      subcat.values.forEach((subItem) => {
        subcats.push({
          name: subItem.name,
          type: subItem.type,
          parentId,
          color: parentCategory.color,
          userId,
          key: subItem.key,
        });
      });
    }
  });

  const subMissingKey = subcats.find((s) => !s.key);
  if (subMissingKey) {
    const message = `Seed integrity bug: default subcategory "${subMissingKey.name}" is missing 'key'`;
    logger.error(message);
    if (process.env.NODE_ENV !== 'production') throw new Error(message);
  }

  if (subcats.length > 0) {
    const createdSubcats = await categoriesService.bulkCreate({ data: subcats }, { returning: true });

    // Add subcategories to the map
    subcats.forEach((subcat, index) => {
      const createdSubcat = createdSubcats[index];
      if (createdSubcat) {
        // Use a composite key for subcategories
        const subcatKey = `${subcat.name.toLowerCase().replace(/\s+/g, '_')}`;
        categoryMap.set(subcatKey, createdSubcat.id);
      }
    });
  }

  // Set default category
  const defaultCategoryKey = translatedCategories.defaultCategoryKey;
  const defaultCategoryId = categoryMap.get(defaultCategoryKey);

  if (defaultCategoryId) {
    await userService.updateUser({
      id: userId,
      defaultCategoryId,
    });
  }

  return categoryMap;
}

export async function createTags({ userId }: { userId: number }): Promise<void> {
  const locale = 'en';
  const translatedTags = getTranslatedDefaultTags({ locale });

  const defaultTags = translatedTags.map((tag) => ({
    name: tag.name,
    color: tag.color,
    icon: tag.icon,
    description: tag.description,
  }));

  if (defaultTags.length > 0) {
    await tagsService.bulkCreateTags({
      userId,
      tags: defaultTags,
    });
  }
}

export async function createAccounts({ userId }: { userId: number }): Promise<Accounts[]> {
  const accounts: Accounts[] = [];

  for (const accountConfig of DEMO_CONFIG.accounts) {
    const account = await accountsService.createAccount({
      userId,
      name: accountConfig.name,
      currencyCode: accountConfig.currency,
      accountCategory: accountConfig.type,
      initialBalance: Money.fromCents(accountConfig.initialBalance),
      creditLimit: Money.fromCents(accountConfig.creditLimit || 0),
      type: ACCOUNT_TYPES.system,
    });
    if (account) {
      accounts.push(account);
    }
  }

  return accounts;
}

export async function createBudgets({
  userId,
  categoryMap,
}: {
  userId: number;
  categoryMap: Map<string, string>;
}): Promise<void> {
  // Create budgets based on config
  for (const budgetConfig of DEMO_CONFIG.budgets) {
    const categoryId = categoryMap.get(budgetConfig.categoryKey);

    if (categoryId) {
      await createBudget({
        userId,
        name: budgetConfig.name,
        status: BUDGET_STATUSES.active,
        limitAmount: Money.fromCents(budgetConfig.limitAmount),
        categoryIds: [categoryId],
      });
    }
  }

  logger.info(`Created ${DEMO_CONFIG.budgets.length} demo budgets`);
}

export async function createSubscriptions({
  userId,
  accountId,
  categoryId,
  referenceDate,
}: {
  userId: number;
  accountId: string;
  categoryId: string | null;
  referenceDate: Date;
}): Promise<void> {
  const startBase = subMonths(referenceDate, 8);

  const rows = DEMO_CONFIG.subscriptions.map((sub) => ({
    id: uuidv7(),
    userId,
    name: sub.name,
    type: 'subscription' as const,
    expectedAmount: sub.expectedAmount,
    expectedCurrencyCode: DEMO_CONFIG.baseCurrency,
    frequency: sub.frequency,
    startDate: format(setDate(startBase, sub.dayOfMonth), 'yyyy-MM-dd'),
    accountId,
    categoryId,
    matchingRules: { rules: [] },
    isActive: true,
  }));

  await Subscriptions.bulkCreate(rows);
  logger.info(`Created ${rows.length} demo subscriptions`);
}

const DEMO_WATCHLIST_CATEGORY_KEYS = ['food', 'housing', 'transportation', 'life', 'income'];

export async function setupDashboardSettings({
  userId,
  categoryMap,
}: {
  userId: number;
  categoryMap: Map<string, string>;
}): Promise<void> {
  const selectedCategoryIds = DEMO_WATCHLIST_CATEGORY_KEYS.map((key) => categoryMap.get(key)).filter(
    (id): id is string => id !== undefined,
  );

  const settings: SettingsSchema = {
    ...DEFAULT_SETTINGS,
    dashboard: {
      widgets: [
        { widgetId: 'balance-trend', colSpan: 2, rowSpan: 1 },
        { widgetId: 'latest-records', colSpan: 1, rowSpan: 1 },
        { widgetId: 'cash-flow', colSpan: 1, rowSpan: 1 },
        { widgetId: 'spending-categories', colSpan: 1, rowSpan: 1 },
        { widgetId: 'category-spending-tracker', colSpan: 1, rowSpan: 1, config: { selectedCategoryIds } },
        { widgetId: 'credit-utilization', colSpan: 1, rowSpan: 1 },
        { widgetId: 'subscriptions-overview', colSpan: 1, rowSpan: 1 },
      ],
    },
  };

  await UserSettings.findOrCreate({
    where: { userId },
    defaults: { settings },
  });

  logger.info(`Configured demo dashboard with spending watchlist (${selectedCategoryIds.length} categories)`);
}

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
    purchaseDaysAgo: 120,
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
    purchaseDaysAgo: 180,
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
    purchaseDaysAgo: 90,
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
    currentPrice: 67500,
    purchasePrice: 42000,
    quantity: 0.35,
    purchaseDaysAgo: 220,
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
    currentPrice: 3500,
    purchasePrice: 2400,
    quantity: 4,
    purchaseDaysAgo: 160,
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
    currentPrice: 145,
    purchasePrice: 95,
    quantity: 40,
    purchaseDaysAgo: 100,
  },
];

const DEMO_INVESTMENT_STARTING_CASH = 5000;
const DEMO_CRYPTO_STARTING_CASH = 1500;

/**
 * Seeds securities, pricing, holdings and the opening buy transaction for a
 * single portfolio. Shared by the stock and crypto portfolios so both asset
 * classes follow the exact same holding-creation path.
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
  const pricingDate = format(referenceDate, 'yyyy-MM-dd');

  for (const sec of securities) {
    const [security, created] = await Securities.findOrCreate({
      where: { providerName: sec.providerName, providerSymbol: sec.providerSymbol },
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

    await SecurityPricing.findOrCreate({
      where: { securityId: security.id, date: pricingDate },
      defaults: {
        securityId: security.id,
        date: pricingDate,
        priceClose: sec.currentPrice.toFixed(10),
        priceAsOf: referenceDate,
        source: 'demo',
      },
      transaction,
    });

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

    const buyDate = format(subDays(referenceDate, sec.purchaseDaysAgo), 'yyyy-MM-dd');
    await InvestmentTransaction.create(
      {
        portfolioId,
        securityId: security.id,
        transactionType: TRANSACTION_TYPES.expense,
        date: buyDate,
        name: `Bought ${sec.quantity} ${sec.symbol}`,
        amount: costBasisStr,
        refAmount: costBasisStr,
        fees: '0',
        refFees: '0',
        quantity: quantityStr,
        price: sec.purchasePrice.toFixed(10),
        refPrice: sec.purchasePrice.toFixed(10),
        currencyCode: sec.currencyCode,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
      },
      { transaction },
    );
  }
}

export async function setupInvestments({
  userId,
  referenceDate,
}: {
  userId: number;
  referenceDate: Date;
}): Promise<void> {
  const transaction = await connection.sequelize.transaction();

  try {
    const stockPortfolio = await Portfolios.create(
      {
        userId,
        name: 'Growth Portfolio',
        portfolioType: PORTFOLIO_TYPE.investment,
        description: 'Demo portfolio of US equities and ETFs',
        isEnabled: true,
      },
      { transaction },
    );

    await seedPortfolioHoldings({
      portfolioId: stockPortfolio.id,
      securities: DEMO_SECURITIES,
      referenceDate,
      transaction,
    });

    const stockCash = new Big(DEMO_INVESTMENT_STARTING_CASH).toFixed(10);

    // Demo base currency is USD, so ref amounts mirror direct amounts 1:1.
    await PortfolioBalances.create(
      {
        portfolioId: stockPortfolio.id,
        currencyCode: 'USD',
        availableCash: stockCash,
        totalCash: stockCash,
        refAvailableCash: stockCash,
        refTotalCash: stockCash,
      },
      { transaction },
    );

    const cryptoPortfolio = await Portfolios.create(
      {
        userId,
        name: 'Crypto Portfolio',
        portfolioType: PORTFOLIO_TYPE.investment,
        description: 'Demo portfolio of crypto holdings',
        isEnabled: true,
      },
      { transaction },
    );

    await seedPortfolioHoldings({
      portfolioId: cryptoPortfolio.id,
      securities: DEMO_CRYPTO,
      referenceDate,
      transaction,
    });

    const cryptoCash = new Big(DEMO_CRYPTO_STARTING_CASH).toFixed(10);

    await PortfolioBalances.create(
      {
        portfolioId: cryptoPortfolio.id,
        currencyCode: 'USD',
        availableCash: cryptoCash,
        totalCash: cryptoCash,
        refAvailableCash: cryptoCash,
        refTotalCash: cryptoCash,
      },
      { transaction },
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  logger.info(
    `Created demo portfolios (${DEMO_SECURITIES.length} stock + ${DEMO_CRYPTO.length} crypto holdings) for user ${userId}`,
  );
}

interface DemoVehicleConfig {
  name: string;
  make: string;
  model: string;
  trim: string;
  vehicleClass: VEHICLE_CLASS;
  /** Years before the reference date the vehicle was purchased. */
  ageYears: number;
  purchasePrice: number;
  currentMileage: number;
  /**
   * Optional mid-term manual revaluation, so the demo shows how an override
   * re-anchors the depreciation curve away from the smooth class default.
   */
  override?: {
    /** Months before the reference date the override took effect. */
    monthsAgo: number;
    targetValue: number;
    note: string;
  };
}

const DEMO_VEHICLES: DemoVehicleConfig[] = [
  {
    name: 'BMW X5',
    make: 'BMW',
    model: 'X5',
    trim: 'xDrive40i',
    vehicleClass: VEHICLE_CLASS.luxury,
    ageYears: 5,
    purchasePrice: 72000,
    currentMileage: 58000,
    override: {
      monthsAgo: 30,
      targetValue: 41000,
      note: 'Independent appraisal after major service',
    },
  },
  {
    name: 'Toyota Corolla',
    make: 'Toyota',
    model: 'Corolla',
    trim: 'LE',
    vehicleClass: VEHICLE_CLASS.sedan,
    ageYears: 1,
    purchasePrice: 26500,
    currentMileage: 12000,
  },
];

export async function setupVehicles({ userId, referenceDate }: { userId: number; referenceDate: Date }): Promise<void> {
  for (const config of DEMO_VEHICLES) {
    const vehicle = await createVehicle({
      userId,
      name: config.name,
      currencyCode: DEMO_CONFIG.baseCurrency,
      make: config.make,
      model: config.model,
      trim: config.trim,
      year: referenceDate.getFullYear() - config.ageYears,
      vehicleClass: config.vehicleClass,
      purchasePrice: Money.fromDecimal(config.purchasePrice),
      purchaseDate: format(subYears(referenceDate, config.ageYears), 'yyyy-MM-dd'),
      depreciationPreset: DEPRECIATION_PRESET.classDefault,
      currentMileage: config.currentMileage,
    });

    if (vehicle && config.override) {
      await overrideVehicleValue({
        userId,
        vehicleId: vehicle.id,
        targetValue: Money.fromDecimal(config.override.targetValue),
        note: config.override.note,
        time: subMonths(referenceDate, config.override.monthsAgo),
      });
    }
  }

  logger.info(`Created ${DEMO_VEHICLES.length} demo vehicles for user ${userId}`);
}

/**
 * Seeds two venture SPV deals so demo users can see both outcomes:
 *  - a successful full exit (~3.8x gross), which auto-progresses to
 *    `fully_exited` and splits carry to the GP, and
 *  - a total write-off, which auto-progresses to `written_off`.
 * Cash flows use `out_of_wallet` so no linked wallet transactions are needed.
 */
export async function setupVentures({ userId, referenceDate }: { userId: number; referenceDate: Date }): Promise<void> {
  const platform = await createVenturePlatform({
    userId,
    name: 'AngelList',
    website: 'https://angellist.com',
    description: 'Syndicate platform for early-stage startup investments',
    defaultEntryFeePct: '0',
    defaultMgmtFeePct: '0.02',
    defaultCarryPct: '0.20',
    defaultHurdlePct: '0',
  });

  // Winner — invested ~4y ago, acquired recently for a ~3.8x gross return.
  const winner = await createVentureDeal({
    userId,
    name: 'Nimbus AI — Series A',
    currencyCode: DEMO_CONFIG.baseCurrency,
    principal: '25000',
    investmentDate: format(subYears(referenceDate, 4), 'yyyy-MM-dd'),
    platformId: platform.id,
    spvSubtype: VENTURE_SPV_SUBTYPE.single_company,
    targetCompany: 'Nimbus AI',
    carryPct: '0.20',
    hurdlePct: '0',
    expectedExitDate: format(subYears(referenceDate, 1), 'yyyy-MM-dd'),
    notes: 'Cloud infrastructure startup — strong growth, acquired by a strategic buyer.',
    initialInvestment: { cashFlowMode: VENTURE_CASH_FLOW_MODE.out_of_wallet },
  });

  await createVentureEvent({
    userId,
    dealId: winner.id,
    type: VENTURE_EVENT_TYPE.exit,
    eventDate: format(subMonths(referenceDate, 2), 'yyyy-MM-dd'),
    grossAmount: '95000',
    navAfter: '0',
    quantityPct: '1',
    cashFlowMode: VENTURE_CASH_FLOW_MODE.out_of_wallet,
    notes: 'Full exit via acquisition.',
  });

  // Loser — invested ~3y ago, company shut down and the position was written off.
  const loser = await createVentureDeal({
    userId,
    name: 'QuickBite — Seed',
    currencyCode: DEMO_CONFIG.baseCurrency,
    principal: '15000',
    investmentDate: format(subYears(referenceDate, 3), 'yyyy-MM-dd'),
    platformId: platform.id,
    spvSubtype: VENTURE_SPV_SUBTYPE.single_company,
    targetCompany: 'QuickBite',
    carryPct: '0.20',
    hurdlePct: '0',
    notes: 'Food delivery startup — ran out of runway and shut down.',
    initialInvestment: { cashFlowMode: VENTURE_CASH_FLOW_MODE.out_of_wallet },
  });

  await createVentureEvent({
    userId,
    dealId: loser.id,
    type: VENTURE_EVENT_TYPE.writedown,
    eventDate: format(subMonths(referenceDate, 6), 'yyyy-MM-dd'),
    navAfter: '0',
    cashFlowMode: VENTURE_CASH_FLOW_MODE.none,
    notes: 'Company ceased operations; position written off.',
  });

  logger.info(`Created 2 demo venture deals for user ${userId}`);
}
