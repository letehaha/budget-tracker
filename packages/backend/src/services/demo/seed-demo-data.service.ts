import {
  ACCOUNT_CATEGORIES,
  ACCOUNT_TYPES,
  BUDGET_STATUSES,
  SUBSCRIPTION_FREQUENCIES,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import {
  ASSET_CLASS,
  INVESTMENT_TRANSACTION_CATEGORY,
  PORTFOLIO_TYPE,
  SECURITY_PROVIDER,
} from '@bt/shared/types/investments';
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
import { Big } from 'big.js';
import { format, setDate, subDays, subMonths } from 'date-fns';
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

export async function createCategories({ userId }: { userId: number }): Promise<Map<string, number>> {
  const locale = 'en';
  const translatedCategories = getTranslatedCategories({ locale });

  // Create default categories
  const defaultCategories = translatedCategories.main.map((item) => ({
    name: item.name,
    type: item.type,
    color: item.color,
    userId,
  }));

  const categories = await categoriesService.bulkCreate({ data: defaultCategories }, { returning: true });

  // Build map of category key -> id
  const categoryMap = new Map<string, number>();
  translatedCategories.main.forEach((item, index) => {
    const createdCategory = categories[index];
    if (createdCategory) {
      categoryMap.set(item.key, createdCategory.id);
    }
  });

  // Create subcategories
  const subcats: Array<{
    name: string;
    parentId: number;
    color: string;
    userId: number;
    type: string;
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
        });
      });
    }
  });

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
  categoryMap: Map<string, number>;
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
  accountId: number;
  categoryId: number | null;
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
  categoryMap: Map<string, number>;
}): Promise<void> {
  const selectedCategoryIds = DEMO_WATCHLIST_CATEGORY_KEYS.map((key) => categoryMap.get(key)).filter(
    (id): id is number => id !== undefined,
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
  name: string;
  assetClass: ASSET_CLASS;
  currencyCode: string;
  exchangeAcronym: string;
  exchangeMic: string;
  exchangeName: string;
  currentPrice: number;
  purchasePrice: number;
  quantity: number;
  purchaseDaysAgo: number;
}

const DEMO_SECURITIES: DemoSecurityConfig[] = [
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    assetClass: ASSET_CLASS.stocks,
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
    name: 'Vanguard S&P 500 ETF',
    assetClass: ASSET_CLASS.stocks,
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
    name: 'Microsoft Corporation',
    assetClass: ASSET_CLASS.stocks,
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

const DEMO_INVESTMENT_STARTING_CASH = 5000;

export async function setupInvestments({
  userId,
  referenceDate,
}: {
  userId: number;
  referenceDate: Date;
}): Promise<void> {
  const transaction = await connection.sequelize.transaction();

  try {
    const portfolio = await Portfolios.create(
      {
        userId,
        name: 'Growth Portfolio',
        portfolioType: PORTFOLIO_TYPE.investment,
        description: 'Demo portfolio of US equities and ETFs',
        isEnabled: true,
      },
      { transaction },
    );

    const pricingDate = format(referenceDate, 'yyyy-MM-dd');

    for (const sec of DEMO_SECURITIES) {
      const [security, created] = await Securities.findOrCreate({
        where: { symbol: sec.symbol },
        defaults: {
          symbol: sec.symbol,
          name: sec.name,
          assetClass: sec.assetClass,
          currencyCode: sec.currencyCode,
          providerName: SECURITY_PROVIDER.yahoo,
          exchangeAcronym: sec.exchangeAcronym,
          exchangeMic: sec.exchangeMic,
          exchangeName: sec.exchangeName,
          pricingLastSyncedAt: referenceDate,
          isBrokerageCash: false,
        },
        transaction,
      });

      // Securities is a shared reference table. If a row for the same symbol
      // already exists (e.g. seeded by a real user sync), findOrCreate silently
      // reuses it and `defaults` are not applied. Surface metadata drift so
      // demo inconsistencies are at least visible in logs.
      if (!created && security.exchangeMic !== sec.exchangeMic) {
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
          portfolioId: portfolio.id,
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
          portfolioId: portfolio.id,
          securityId: security.id,
          transactionType: TRANSACTION_TYPES.expense,
          date: buyDate,
          name: `Bought ${sec.quantity} shares of ${sec.symbol}`,
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

    const remainingCash = new Big(DEMO_INVESTMENT_STARTING_CASH).toFixed(10);

    // Demo base currency is USD, so ref amounts mirror direct amounts 1:1.
    await PortfolioBalances.create(
      {
        portfolioId: portfolio.id,
        currencyCode: 'USD',
        availableCash: remainingCash,
        totalCash: remainingCash,
        refAvailableCash: remainingCash,
        refTotalCash: remainingCash,
      },
      { transaction },
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  logger.info(`Created demo portfolio with ${DEMO_SECURITIES.length} holdings for user ${userId}`);
}
