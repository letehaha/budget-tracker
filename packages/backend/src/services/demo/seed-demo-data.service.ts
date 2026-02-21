import { ACCOUNT_CATEGORIES, ACCOUNT_TYPES, BUDGET_STATUSES } from '@bt/shared/types';
import { getTranslatedCategories } from '@common/const/default-categories';
import { getTranslatedDefaultTags } from '@common/const/default-tags';
import { Money } from '@common/types/money';
import { logger } from '@js/utils/logger';
import Accounts from '@models/Accounts.model';
import * as UsersCurrencies from '@models/UsersCurrencies.model';
import * as accountsService from '@services/accounts.service';
import { createBudget } from '@services/budgets/create-budget';
import * as categoriesService from '@services/categories.service';
import * as tagsService from '@services/tags';
import * as userService from '@services/user.service';

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
