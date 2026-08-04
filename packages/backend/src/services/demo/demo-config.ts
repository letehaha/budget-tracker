import { ACCOUNT_CATEGORIES, SUBSCRIPTION_FREQUENCIES } from '@bt/shared/types';

/**
 * Quote units per 1 USD, as of today. `rateForDayOffset` drifts historical rows
 * around this spot value, so `refAmount` isn't pinned to one frozen number. The
 * index signature lets lookups key off a currency-code variable; USD needs none.
 */
const EXCHANGE_RATES: { EUR: number; PLN: number; [currencyCode: string]: number | undefined } = {
  EUR: 0.92,
  PLN: 4.0,
};

interface DemoAccountBase {
  key: string;
  name: string;
  currency: string;
  type: ACCOUNT_CATEGORIES;
  initialBalance: number;
  creditLimit: number;
}

/**
 * One of the demo's cash accounts. `key` is the identity every other file
 * addresses it by. Logos follow the same convention as demo subscriptions:
 * a real brand domain where one fits, a monogram where the account has no brand
 * behind it. The three logo shapes are exclusive – a domain and initials fill
 * the same slot, and a color with no initials to paint behind is rejected by
 * the write path.
 */
export type DemoAccountConfig = DemoAccountBase &
  (
    | { logoDomain: string; logoInitials?: never; logoColor?: never }
    | { logoDomain?: never; logoInitials: string; logoColor: string }
    | { logoDomain?: never; logoInitials?: never; logoColor?: never }
  );

/**
 * The demo's accounts, currencies and FX, budgets and subscriptions.
 *
 * Lives apart from the seeders so the pure template generator can read it
 * without importing DB-touching code. Records that only a seeder builds
 * (vehicles, loans, securities, account groups) are configured next to it.
 */
export const DEMO_CONFIG = {
  // 36 months of history so e2e always has at least 2 years to query.
  historyMonths: 36,
  baseCurrency: 'USD',
  currencies: ['USD', 'EUR', 'PLN'],
  exchangeRates: EXCHANGE_RATES,
  accounts: [
    {
      key: 'main_checking',
      name: 'Main Checking',
      currency: 'USD',
      type: ACCOUNT_CATEGORIES.currentAccount,
      initialBalance: 500000, // $5,000 in cents
      creditLimit: 0,
      logoDomain: 'chase.com',
    },
    {
      key: 'savings',
      name: 'Savings',
      currency: 'USD',
      type: ACCOUNT_CATEGORIES.saving,
      initialBalance: 1200000, // $12,000 in cents
      creditLimit: 0,
      logoDomain: 'ally.com',
    },
    {
      key: 'travel_card',
      name: 'Travel Card',
      currency: 'EUR',
      type: ACCOUNT_CATEGORIES.creditCard,
      initialBalance: 0,
      creditLimit: 300000, // €3,000 limit
      logoDomain: 'revolut.com',
    },
    {
      key: 'cash',
      name: 'Cash',
      currency: 'PLN',
      type: ACCOUNT_CATEGORIES.cash,
      initialBalance: 50000, // 500 PLN in cents
      creditLimit: 0,
      logoInitials: 'zł',
      logoColor: '#16a34a',
    },
  ] as const satisfies readonly DemoAccountConfig[],
  /**
   * Budget limits derive from what the generated data spends, not a number fixed
   * here, so each card lands on its target utilization regardless of generator drift.
   * `targetUtilization` sets the fraction of the limit the trailing window should
   * consume: under, near, and over, so a visitor sees all three progress-bar states.
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
   * `matchKeywords` seeds `matchingRules` so auto-matching has something to find.
   * `logoDomain` is stored as a manual override so the brand-logo worker skips a
   * per-demo-user lookup.
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
 * Stable identity of a demo cash account. The template, the seeders and the
 * account groups all address the accounts by this key, never by display name.
 */
export type DemoAccountKey = (typeof DEMO_CONFIG.accounts)[number]['key'];

/**
 * Tags the demo attaches to generated transactions.
 *
 * The three defaults every user gets (want / need / must) are seeded elsewhere
 * and reused here by name, so the demo shows them in active use instead of at
 * zero. The rest are demo-only.
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
