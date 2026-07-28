import { ACCOUNT_CATEGORIES, SUBSCRIPTION_FREQUENCIES } from '@bt/shared/types';

/**
 * Shape of the demo dataset.
 *
 * Lives apart from the seeders so the pure template generator can read it
 * without importing DB-touching code.
 */
export const DEMO_CONFIG = {
  // Transaction history spans 2.5+ years (36 months to ensure tests always get >= 2 years)
  historyMonths: 36,
  baseCurrency: 'USD',
  currencies: ['USD', 'EUR', 'PLN'],
  /**
   * Quote units per 1 USD, as of today. Historical rows drift around these via
   * `rateForDayOffset`, so a demo transaction's `refAmount` reflects the rate on
   * its own date rather than one frozen constant.
   */
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
  /**
   * Budget limits are derived from what the generated data actually spends, not
   * fixed here, so each card lands on a chosen utilization no matter how the
   * generator's amounts drift. `targetUtilization` is the fraction of the limit
   * the trailing window should consume: under, near, and over, so a visitor sees
   * all three states of the progress bar at once.
   */
  budgets: [
    { name: 'Groceries', categoryKeys: ['food/groceries'], targetUtilization: 0.72 },
    { name: 'Eating Out', categoryKeys: ['food/restaurant', 'food/bar-cafe'], targetUtilization: 1.14 },
    {
      name: 'Shopping',
      categoryKeys: [
        'shopping/clothes-shoes',
        'shopping/electronics-accessories',
        'shopping/home-garden',
        'shopping/health-beauty',
        'shopping/drugstore-chemist',
      ],
      targetUtilization: 0.91,
    },
  ],
  /**
   * `matchKeywords` seeds the subscription's `matchingRules` so auto-matching
   * has something to find, and `logoDomain` is stored as a manual override so
   * the brand-logo worker skips the row instead of doing a lookup per demo user.
   */
  subscriptions: [
    {
      name: 'Netflix',
      expectedAmount: 1599,
      dayOfMonth: 2,
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      logoDomain: 'netflix.com',
      matchKeywords: ['netflix'],
      categoryKey: 'life/tv-streaming',
    },
    {
      name: 'Apple One',
      expectedAmount: 1995,
      dayOfMonth: 5,
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      logoDomain: 'apple.com',
      matchKeywords: ['apple one', 'apple.com/bill'],
      categoryKey: 'communication/software-apps-games',
    },
    {
      name: 'Spotify',
      expectedAmount: 999,
      dayOfMonth: 8,
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      logoDomain: 'spotify.com',
      matchKeywords: ['spotify'],
      categoryKey: 'life/tv-streaming',
    },
    {
      name: 'YouTube Premium',
      expectedAmount: 1399,
      dayOfMonth: 12,
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      logoDomain: 'youtube.com',
      matchKeywords: ['youtube', 'google youtube'],
      categoryKey: 'life/tv-streaming',
    },
    {
      name: 'Adobe Creative Cloud',
      expectedAmount: 5499,
      dayOfMonth: 15,
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      logoDomain: 'adobe.com',
      matchKeywords: ['adobe'],
      categoryKey: 'communication/software-apps-games',
    },
    {
      name: 'Amazon Prime',
      expectedAmount: 1499,
      dayOfMonth: 20,
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      logoDomain: 'amazon.com',
      matchKeywords: ['amazon prime', 'prime membership'],
      categoryKey: 'life/tv-streaming',
    },
    {
      name: 'ChatGPT Plus',
      expectedAmount: 2000,
      dayOfMonth: 25,
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      logoDomain: 'openai.com',
      matchKeywords: ['openai', 'chatgpt'],
      categoryKey: 'communication/software-apps-games',
    },
  ],
};

/**
 * Tags the demo attaches to generated transactions.
 *
 * The three defaults every user gets (want / need / must) are seeded elsewhere
 * and reused here by name, so the demo shows them doing real work instead of
 * sitting at zero usage. The rest are demo-only.
 */
export const DEMO_TAGS = [
  { key: 'reimbursable', name: 'Reimbursable', color: '#0ea5e9', icon: 'receipt' },
  { key: 'vacation', name: 'Vacation', color: '#f59e0b', icon: 'palmtree' },
  { key: 'subscription', name: 'Subscription', color: '#8b5cf6', icon: 'repeat' },
];

/** Composite key used to address a seeded subcategory in the demo's category map. */
export function subcategoryMapKey({ parentKey, key }: { parentKey: string; key: string }): string {
  return `${parentKey}/${key}`;
}
