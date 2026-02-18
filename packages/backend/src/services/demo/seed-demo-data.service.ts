import {
  ACCOUNT_CATEGORIES,
  ACCOUNT_TYPES,
  BUDGET_STATUSES,
  PAYMENT_TYPES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import { getTranslatedCategories } from '@common/const/default-categories';
import { getTranslatedDefaultTags } from '@common/const/default-tags';
import { Money } from '@common/types/money';
import { faker } from '@faker-js/faker';
import { i18nextReady } from '@i18n/index';
import { logger } from '@js/utils/logger';
import Accounts from '@models/Accounts.model';
import * as UsersCurrencies from '@models/UsersCurrencies.model';
import * as accountsService from '@services/accounts.service';
import { createBudget } from '@services/budgets/create-budget';
import * as categoriesService from '@services/categories.service';
import * as tagsService from '@services/tags';
import * as transactionsService from '@services/transactions';
import * as userService from '@services/user.service';
import { addDays, eachDayOfInterval, endOfMonth, isWeekend, setDate, startOfMonth, subMonths } from 'date-fns';

// Demo data configuration based on PRD
const DEMO_CONFIG = {
  // Transaction history spans 2.5+ years (36 months to ensure tests always get >= 2 years)
  historyMonths: 36,
  baseCurrency: 'USD',
  currencies: ['USD', 'EUR', 'PLN'],
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

interface SeedDemoDataParams {
  userId: number;
}

/**
 * Seeds demo data for a new demo user.
 * Creates accounts, categories, transactions, and budgets with realistic patterns.
 */
export async function seedDemoData({ userId }: SeedDemoDataParams): Promise<void> {
  logger.info(`Seeding demo data for user ${userId}...`);

  // Ensure i18n is fully loaded before using translations
  await i18nextReady;

  // 1. Set up currencies for the user
  await setupCurrencies({ userId });

  // 2. Create default categories
  const categoryMap = await createCategories({ userId });

  // 3. Create default tags
  await createTags({ userId });

  // 4. Create accounts
  const accounts = await createAccounts({ userId });

  // 5. Generate transactions with realistic patterns
  // Note: Account balances are automatically updated by transaction hooks
  await generateTransactions({ userId, accounts, categoryMap });

  // 6. Create budgets
  await createBudgets({ userId, categoryMap });

  logger.info(`Demo data seeding complete for user ${userId}`);
}

async function setupCurrencies({ userId }: { userId: number }): Promise<void> {
  // Add USD as default currency
  await UsersCurrencies.addCurrency({
    userId,
    currencyCode: 'USD',
    exchangeRate: 1,
    isDefaultCurrency: true,
    liveRateUpdate: true,
  });

  // Add EUR and PLN
  await UsersCurrencies.addCurrency({
    userId,
    currencyCode: 'EUR',
    exchangeRate: 0.92, // Approximate EUR/USD rate
    isDefaultCurrency: false,
    liveRateUpdate: true,
  });

  await UsersCurrencies.addCurrency({
    userId,
    currencyCode: 'PLN',
    exchangeRate: 4.0, // Approximate PLN/USD rate
    isDefaultCurrency: false,
    liveRateUpdate: true,
  });
}

async function createCategories({ userId }: { userId: number }): Promise<Map<string, number>> {
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

async function createTags({ userId }: { userId: number }): Promise<void> {
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

async function createAccounts({ userId }: { userId: number }): Promise<Accounts[]> {
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

async function generateTransactions({
  userId,
  accounts,
  categoryMap,
}: {
  userId: number;
  accounts: Accounts[];
  categoryMap: Map<string, number>;
}): Promise<void> {
  const endDate = new Date();
  const startDate = subMonths(endDate, DEMO_CONFIG.historyMonths);

  const mainAccount = accounts.find((a) => a.name === 'Main Checking')!;
  const travelCard = accounts.find((a) => a.name === 'Travel Card')!;
  const cashAccount = accounts.find((a) => a.name === 'Cash')!;

  // Get category IDs (using correct keys from default-categories.ts)
  const incomeId = categoryMap.get('income') || categoryMap.get('other') || 1;
  const housingId = categoryMap.get('housing') || categoryMap.get('other') || 1;
  const foodId = categoryMap.get('food') || categoryMap.get('other') || 1;
  const lifeId = categoryMap.get('life') || categoryMap.get('other') || 1; // life includes entertainment, hobbies, etc.
  const transportId = categoryMap.get('transportation') || categoryMap.get('other') || 1;
  const healthId = categoryMap.get('life') || categoryMap.get('other') || 1; // health is under life category
  const shoppingId = categoryMap.get('shopping') || categoryMap.get('other') || 1;
  const travelId = categoryMap.get('life') || categoryMap.get('other') || 1; // travel/hotels is under life category
  const otherId = categoryMap.get('other') || 1;

  // Build a map of accountId to accountType for transaction creation
  const accountTypeMap = new Map<number, ACCOUNT_TYPES>();
  for (const account of accounts) {
    accountTypeMap.set(account.id, account.type);
  }

  const transactions: Array<{
    amount: number;
    transactionType: TRANSACTION_TYPES;
    categoryId: number;
    accountId: number;
    accountType: ACCOUNT_TYPES;
    time: Date;
    note: string;
    paymentType: PAYMENT_TYPES;
  }> = [];

  // Generate monthly recurring transactions
  let currentDate = startDate;
  while (currentDate <= endDate) {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);

    // Salary - 1st of month (income)
    const salaryDate = setDate(currentDate, 1);
    if (salaryDate >= startDate && salaryDate <= endDate) {
      const salaryAmount = faker.number.int({ min: 420000, max: 480000 }); // $4,200 - $4,800 in cents
      transactions.push({
        amount: salaryAmount,
        transactionType: TRANSACTION_TYPES.income,
        categoryId: incomeId,
        accountId: mainAccount.id,
        accountType: accountTypeMap.get(mainAccount.id)!,
        time: salaryDate,
        note: 'Monthly Salary',
        paymentType: PAYMENT_TYPES.bankTransfer,
      });
    }

    // Rent - 5th of month
    const rentDate = setDate(currentDate, 5);
    if (rentDate >= startDate && rentDate <= endDate) {
      transactions.push({
        amount: 140000, // $1,400 in cents
        transactionType: TRANSACTION_TYPES.expense,
        categoryId: housingId,
        accountId: mainAccount.id,
        accountType: accountTypeMap.get(mainAccount.id)!,
        time: rentDate,
        note: 'Monthly Rent',
        paymentType: PAYMENT_TYPES.bankTransfer,
      });
    }

    // Gym membership - 1st of month
    const gymDate = setDate(currentDate, 1);
    if (gymDate >= startDate && gymDate <= endDate) {
      transactions.push({
        amount: 4500, // $45 in cents
        transactionType: TRANSACTION_TYPES.expense,
        categoryId: healthId,
        accountId: mainAccount.id,
        accountType: accountTypeMap.get(mainAccount.id)!,
        time: gymDate,
        note: 'Gym Membership',
        paymentType: PAYMENT_TYPES.debitCard,
      });
    }

    // Netflix - 15th of month
    const netflixDate = setDate(currentDate, 15);
    if (netflixDate >= startDate && netflixDate <= endDate) {
      transactions.push({
        amount: 1599, // $15.99 in cents
        transactionType: TRANSACTION_TYPES.expense,
        categoryId: lifeId,
        accountId: mainAccount.id,
        accountType: accountTypeMap.get(mainAccount.id)!,
        time: netflixDate,
        note: 'Netflix Subscription',
        paymentType: PAYMENT_TYPES.debitCard,
      });
    }

    // Spotify - 10th of month
    const spotifyDate = setDate(currentDate, 10);
    if (spotifyDate >= startDate && spotifyDate <= endDate) {
      transactions.push({
        amount: 999, // $9.99 in cents
        transactionType: TRANSACTION_TYPES.expense,
        categoryId: lifeId,
        accountId: mainAccount.id,
        accountType: accountTypeMap.get(mainAccount.id)!,
        time: spotifyDate,
        note: 'Spotify Premium',
        paymentType: PAYMENT_TYPES.debitCard,
      });
    }

    // Utilities - 20th of month
    const utilitiesDate = setDate(currentDate, 20);
    if (utilitiesDate >= startDate && utilitiesDate <= endDate) {
      const utilitiesAmount = faker.number.int({ min: 8000, max: 18000 }); // $80-$180
      transactions.push({
        amount: utilitiesAmount,
        transactionType: TRANSACTION_TYPES.expense,
        categoryId: housingId,
        accountId: mainAccount.id,
        accountType: accountTypeMap.get(mainAccount.id)!,
        time: utilitiesDate,
        note: 'Utilities Bill',
        paymentType: PAYMENT_TYPES.bankTransfer,
      });
    }

    // Internet - 25th of month
    const internetDate = setDate(currentDate, 25);
    if (internetDate >= startDate && internetDate <= endDate) {
      transactions.push({
        amount: 6500, // $65 in cents
        transactionType: TRANSACTION_TYPES.expense,
        categoryId: housingId,
        accountId: mainAccount.id,
        accountType: accountTypeMap.get(mainAccount.id)!,
        time: internetDate,
        note: 'Internet Service',
        paymentType: PAYMENT_TYPES.bankTransfer,
      });
    }

    // Variable expenses throughout the month
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    for (const day of daysInMonth) {
      if (day < startDate || day > endDate) continue;

      // Groceries - 2-3x per week (every 2-3 days)
      if (faker.number.int({ min: 1, max: 3 }) === 1) {
        const groceryAmount = faker.number.int({ min: 4000, max: 12000 }); // $40-$120
        transactions.push({
          amount: groceryAmount,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: foodId,
          accountId: mainAccount.id,
          accountType: accountTypeMap.get(mainAccount.id)!,
          time: day,
          note: faker.helpers.arrayElement(['Whole Foods', "Trader Joe's", 'Costco', 'Safeway', 'Local Market']),
          paymentType: PAYMENT_TYPES.debitCard,
        });
      }

      // Dining out - 1-2x per week
      if (faker.number.int({ min: 1, max: 5 }) === 1) {
        const diningAmount = faker.number.int({ min: 2500, max: 8000 }); // $25-$80
        transactions.push({
          amount: diningAmount,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: foodId,
          accountId: mainAccount.id,
          accountType: accountTypeMap.get(mainAccount.id)!,
          time: day,
          note: faker.helpers.arrayElement(['Restaurant', 'Chipotle', 'Sushi Place', 'Italian Bistro', 'Thai Kitchen']),
          paymentType: PAYMENT_TYPES.debitCard,
        });
      }

      // Coffee - 3-4x per week (weekdays mostly)
      if (!isWeekend(day) && faker.number.int({ min: 1, max: 2 }) === 1) {
        const coffeeAmount = faker.number.int({ min: 400, max: 800 }); // $4-$8
        transactions.push({
          amount: coffeeAmount,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: foodId,
          accountId: mainAccount.id,
          accountType: accountTypeMap.get(mainAccount.id)!,
          time: day,
          note: faker.helpers.arrayElement(['Starbucks', 'Local Coffee Shop', "Dunkin'", 'Blue Bottle']),
          paymentType: PAYMENT_TYPES.debitCard,
        });
      }

      // Transport - weekly
      if (day.getDay() === 1) {
        // Mondays
        const transportAmount = faker.number.int({ min: 3000, max: 6000 }); // $30-$60
        transactions.push({
          amount: transportAmount,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: transportId,
          accountId: mainAccount.id,
          accountType: accountTypeMap.get(mainAccount.id)!,
          time: day,
          note: faker.helpers.arrayElement(['Uber', 'Gas Station', 'Metro Card', 'Parking']),
          paymentType: PAYMENT_TYPES.debitCard,
        });
      }

      // Random entertainment - occasional
      if (faker.number.int({ min: 1, max: 10 }) === 1) {
        const entertainmentAmount = faker.number.int({ min: 1500, max: 8000 }); // $15-$80
        transactions.push({
          amount: entertainmentAmount,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: lifeId,
          accountId: mainAccount.id,
          accountType: accountTypeMap.get(mainAccount.id)!,
          time: day,
          note: faker.helpers.arrayElement(['Movie Theater', 'Concert Tickets', 'Bowling', 'Arcade', 'Mini Golf']),
          paymentType: PAYMENT_TYPES.debitCard,
        });
      }

      // Shopping - occasional
      if (faker.number.int({ min: 1, max: 15 }) === 1) {
        const shoppingAmount = faker.number.int({ min: 10000, max: 50000 }); // $100-$500
        transactions.push({
          amount: shoppingAmount,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: shoppingId,
          accountId: mainAccount.id,
          accountType: accountTypeMap.get(mainAccount.id)!,
          time: day,
          note: faker.helpers.arrayElement(['Amazon', 'Target', 'Best Buy', 'Nike', 'Apple Store']),
          paymentType: PAYMENT_TYPES.debitCard,
        });
      }
    }

    // Travel expenses on travel card (occasional, in EUR)
    if (faker.number.int({ min: 1, max: 3 }) === 1) {
      const travelDay = faker.date.between({ from: monthStart, to: monthEnd });
      if (travelDay >= startDate && travelDay <= endDate) {
        const travelAmount = faker.number.int({ min: 5000, max: 30000 }); // €50-€300
        transactions.push({
          amount: travelAmount,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: travelId,
          accountId: travelCard.id,
          accountType: accountTypeMap.get(travelCard.id)!,
          time: travelDay,
          note: faker.helpers.arrayElement([
            'Hotel Booking',
            'Flight Ticket',
            'Train Ticket',
            'Airbnb',
            'Travel Insurance',
          ]),
          paymentType: PAYMENT_TYPES.creditCard,
        });
      }
    }

    // Cash withdrawals and expenses (PLN)
    if (faker.number.int({ min: 1, max: 4 }) === 1) {
      const cashDay = faker.date.between({ from: monthStart, to: monthEnd });
      if (cashDay >= startDate && cashDay <= endDate) {
        const cashAmount = faker.number.int({ min: 5000, max: 20000 }); // 50-200 PLN
        transactions.push({
          amount: cashAmount,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: otherId,
          accountId: cashAccount.id,
          accountType: accountTypeMap.get(cashAccount.id)!,
          time: cashDay,
          note: faker.helpers.arrayElement(['Local Market', 'Street Food', 'Tips', 'Small Purchases']),
          paymentType: PAYMENT_TYPES.cash,
        });
      }
    }

    // Move to next month
    currentDate = addDays(monthEnd, 1);
  }

  // Bulk create all transactions
  logger.info(`Creating ${transactions.length} demo transactions...`);

  // Create transactions in batches to avoid overwhelming the database
  const batchSize = 500;
  for (let i = 0; i < transactions.length; i += batchSize) {
    const batch = transactions.slice(i, i + batchSize);
    await Promise.all(
      batch.map((tx) =>
        transactionsService.createTransaction({
          userId,
          amount: Money.fromCents(tx.amount),
          transactionType: tx.transactionType,
          categoryId: tx.categoryId,
          accountId: tx.accountId,
          accountType: tx.accountType,
          transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
          time: tx.time,
          note: tx.note,
          paymentType: tx.paymentType,
        }),
      ),
    );
  }

  logger.info(`Created ${transactions.length} demo transactions`);
}

async function createBudgets({
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
        limitAmount: budgetConfig.limitAmount,
        categoryIds: [categoryId],
      });
    }
  }

  logger.info(`Created ${DEMO_CONFIG.budgets.length} demo budgets`);
}
