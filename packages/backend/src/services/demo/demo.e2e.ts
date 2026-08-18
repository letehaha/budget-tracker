import {
  ACCOUNT_CATEGORIES,
  API_ERROR_CODES,
  API_RESPONSE_STATUS,
  BUDGET_TYPES,
  LOAN_TYPE,
  PAYMENT_TYPES,
  SUBSCRIPTION_PERIOD_STATUSES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  USER_ROLES,
  VEHICLE_CLASS,
} from '@bt/shared/types';
import { ASSET_CLASS } from '@bt/shared/types/investments';
import { VENTURE_DEAL_STATUS } from '@bt/shared/types/venture';
import { authPool } from '@config/auth';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { connection } from '@models/index';
import Users from '@models/users.model';
import { extractCookies, makeAuthRequest, makeRequest } from '@tests/helpers';
import { clearMockSession, registerMockSession } from '@tests/mocks/better-auth';

import { DEMO_ACCOUNT_GROUPS } from './seed-account-groups.service';
import { allDemoPayeeMerchants } from './template/merchants';

/**
 * Extracts the session token value from a cookie string.
 */
function extractSessionToken(cookieString: string): string | null {
  const match = cookieString.match(/bt_auth\.session_token=([^;]+)/);
  return match?.[1] ?? null;
}

/**
 * Helper to create a demo user and set up authentication for subsequent requests.
 * Returns the user ID and session token.
 */
async function createDemoUserAndAuth(): Promise<{
  userId: number;
  authUserId: string;
  sessionToken: string;
  cookies: string;
}> {
  global.APP_AUTH_COOKIES = null;

  const res = await makeAuthRequest({
    method: 'post',
    url: '/demo',
  });

  if (res.statusCode !== 200) {
    throw new Error(`Failed to create demo user: ${JSON.stringify(res.body)}`);
  }

  const userId = res.body.response.user.id;
  const cookies = extractCookies(res);
  const sessionToken = extractSessionToken(cookies);

  if (!sessionToken) {
    throw new Error('No session token found in demo response cookies');
  }

  // Get the authUserId from the database
  const user = await Users.findByPk(userId);
  if (!user?.authUserId) {
    throw new Error('Demo user has no authUserId');
  }

  // Register the session with the better-auth mock so subsequent requests work
  registerMockSession(sessionToken, {
    id: user.authUserId,
    email: `demo-${userId}@demo.local`,
  });

  global.APP_AUTH_COOKIES = cookies;

  return {
    userId,
    authUserId: user.authUserId,
    sessionToken,
    cookies,
  };
}

/** The transaction fields the dataset assertions below read off `GET /transactions`. */
interface DemoTransactionRow {
  id: string;
  amount: number;
  refAmount: number;
  transactionType: string;
  transferNature: string;
  transferId: string | null;
  accountId: string;
  categoryId: string | null;
  currencyCode: string;
  payeeId: string | null;
  refundLinked: boolean;
  splits?: { amount: number }[];
  tags?: { id: string; name: string }[];
}

/**
 * Demo Mode E2E Tests
 *
 * Tests the complete demo user flow:
 * 1. Creating demo users via API
 * 2. Verifying seeded demo data
 * 3. Demo user restrictions
 * 4. Demo user cleanup
 */
describe('Demo Mode', () => {
  // Store original auth cookies to restore after each test
  let originalAuthCookies: string | null;

  beforeEach(() => {
    originalAuthCookies = global.APP_AUTH_COOKIES;
  });

  afterEach(async () => {
    // Restore original auth cookies
    global.APP_AUTH_COOKIES = originalAuthCookies;
  });

  describe('POST /demo - Create Demo User', () => {
    it('successfully creates a demo user and returns session credentials', async () => {
      // Clear auth cookies to simulate unauthenticated visitor
      global.APP_AUTH_COOKIES = null;

      const res = await makeAuthRequest({
        method: 'post',
        url: '/demo',
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe(API_RESPONSE_STATUS.success);
      expect(res.body.response.user).toBeDefined();
      expect(res.body.response.user.role).toBe(USER_ROLES.demo);

      // Should set session cookie
      const setCookie = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      const cookieStr = Array.isArray(setCookie) ? setCookie.join('') : setCookie;
      expect(cookieStr).toContain('bt_auth.session_token');
    }, 60000); // 60s timeout - demo user creation involves lots of data seeding

    it('creates a user with demo role in database', async () => {
      global.APP_AUTH_COOKIES = null;

      const res = await makeAuthRequest({
        method: 'post',
        url: '/demo',
      });

      expect(res.statusCode).toBe(200);
      const userId = res.body.response.user.id;

      // Verify user exists with demo role
      const user = await Users.findByPk(userId);
      expect(user).not.toBeNull();
      expect(user?.role).toBe(USER_ROLES.demo);
    }, 60000); // 60s timeout - demo user creation involves lots of data seeding

    it('creates better-auth records for the demo user', async () => {
      global.APP_AUTH_COOKIES = null;

      const res = await makeAuthRequest({
        method: 'post',
        url: '/demo',
      });

      expect(res.statusCode).toBe(200);
      const userId = res.body.response.user.id;

      // Get the app user to find authUserId
      const appUser = await Users.findByPk(userId);
      expect(appUser?.authUserId).toBeDefined();

      // Verify ba_user exists (created directly by createDemoUser)
      const baUsersResult = await authPool.query('SELECT * FROM ba_user WHERE id = $1', [appUser?.authUserId]);
      expect(baUsersResult.rows).toHaveLength(1);

      // Verify ba_account exists (credential account for password auth)
      const baAccountsResult = await authPool.query('SELECT * FROM ba_account WHERE "userId" = $1', [
        appUser?.authUserId,
      ]);
      expect(baAccountsResult.rows).toHaveLength(1);

      // Note: ba_session is created by better-auth signInEmail which is mocked in tests.
      // The session is tracked in the mock's sessionStore instead.
    }, 60000); // 60s timeout - demo user creation involves lots of data seeding
  });

  describe('POST /demo - Signup cap gate', () => {
    afterEach(() => {
      delete process.env.SYSTEM_MAX_SIGNUPS_ALLOWED;
    });

    it('rejects demo creation when signups are closed', async () => {
      global.APP_AUTH_COOKIES = null;
      process.env.SYSTEM_MAX_SIGNUPS_ALLOWED = '0';

      const res = await makeAuthRequest({
        method: 'post',
        url: '/demo',
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.status).toBe(API_RESPONSE_STATUS.error);
      expect(res.body.response.code).toBe(API_ERROR_CODES.forbidden);
    }, 60000);

    it('creates a demo user when signups are open', async () => {
      global.APP_AUTH_COOKIES = null;
      delete process.env.SYSTEM_MAX_SIGNUPS_ALLOWED;

      const res = await makeAuthRequest({
        method: 'post',
        url: '/demo',
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.response.user.role).toBe(USER_ROLES.demo);
    }, 60000);
  });

  describe('Demo Data Seeding', () => {
    let demoSessionToken: string;

    beforeEach(async () => {
      const demoUser = await createDemoUserAndAuth();
      demoSessionToken = demoUser.sessionToken;
    }, 60000); // 60s timeout - demo user creation involves lots of data

    afterEach(() => {
      // Clean up the mock session
      if (demoSessionToken) {
        clearMockSession(demoSessionToken);
      }
    });

    it('seeds 4 cash accounts with different currencies (plus 2 vehicle + 3 loan accounts)', async () => {
      const accountsRes = await makeRequest({
        method: 'get',
        url: '/accounts',
        raw: true,
      });

      // Vehicle assets (category 'vehicle') and loans (category 'loan') are both
      // tracked as system accounts, so the accounts list also contains the 2
      // seeded cars and 3 seeded loans.
      const cashAccounts = accountsRes.filter(
        (a: { accountCategory: string }) =>
          a.accountCategory !== ACCOUNT_CATEGORIES.vehicle && a.accountCategory !== ACCOUNT_CATEGORIES.loan,
      );
      const vehicleAccounts = accountsRes.filter(
        (a: { accountCategory: string }) => a.accountCategory === ACCOUNT_CATEGORIES.vehicle,
      );
      const loanAccounts = accountsRes.filter(
        (a: { accountCategory: string }) => a.accountCategory === ACCOUNT_CATEGORIES.loan,
      );

      expect(cashAccounts.length).toBe(4);
      expect(vehicleAccounts.length).toBe(2);
      expect(loanAccounts.length).toBe(3);

      // Verify currencies on the cash accounts
      const currencyCodes = cashAccounts.map((a: { currencyId: number }) => a.currencyId);
      expect(currencyCodes.length).toBe(4);

      // Every cash account ships with a logo: a brand domain for the bank-backed
      // ones, a monogram for Cash. Expectations are literals — reading them from
      // the config the seeder consumes passes even with the logo removed.
      const seededLogos = (
        cashAccounts as {
          name: string;
          logoDomain: string | null;
          logoInitials: string | null;
          logoColor: string | null;
        }[]
      ).map(({ name, logoDomain, logoInitials, logoColor }) => ({ name, logoDomain, logoInitials, logoColor }));

      expect(seededLogos).toEqual(
        expect.arrayContaining([
          { name: 'Main Checking', logoDomain: 'chase.com', logoInitials: null, logoColor: null },
          { name: 'Savings', logoDomain: 'ally.com', logoInitials: null, logoColor: null },
          { name: 'Travel Card', logoDomain: 'revolut.com', logoInitials: null, logoColor: null },
          { name: 'Cash', logoDomain: null, logoInitials: 'zł', logoColor: '#16a34a' },
        ]),
      );

      // The seeder writes through the service, skipping the zod normalization the
      // API applies, so an uppercase hex would reach the frontend unmatched by
      // its lowercase preset swatches.
      for (const { logoColor } of seededLogos) {
        if (logoColor !== null) expect(logoColor).toMatch(/^#[0-9a-f]{6}$/);
      }
    });

    it('seeds transactions spanning 2.5 years', async () => {
      // Get transactions with high limit to ensure we get all of them
      // Demo seeding creates ~1500+ transactions over 36 months
      const transactionsRes = await makeRequest({
        method: 'get',
        url: '/transactions',
        payload: { limit: 5000 },
      });

      // Ensure request was successful
      expect(transactionsRes.statusCode).toBe(200);

      // The getTransactions controller returns { data: serializeTransactions(transactions) }
      // which gets wrapped by createController to: { status: 'success', response: { data: [...] } }
      // However, serializeTransactions returns an array directly, so response.data is the array
      const responseBody = transactionsRes.body.response;
      expect(responseBody).toBeDefined();

      // The response might be just the array (since serializeTransactions returns an array)
      // Check both structures to understand the actual format
      const txData = Array.isArray(responseBody) ? responseBody : responseBody?.data;
      expect(txData).toBeDefined();
      expect(Array.isArray(txData)).toBe(true);

      // Should have a significant number of transactions
      expect(txData.length).toBeGreaterThan(100);

      // Check date range
      const dates = txData.map((t: { time: string }) => new Date(t.time));
      const oldestDate = new Date(Math.min(...dates.map((d: Date) => d.getTime())));
      const newestDate = new Date(Math.max(...dates.map((d: Date) => d.getTime())));

      // Should span at least 2 years
      const yearsDiff = (newestDate.getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
      expect(yearsDiff).toBeGreaterThanOrEqual(2);
    });

    it('seeds budgets', async () => {
      const budgetsRes = await makeRequest({
        method: 'get',
        url: '/budgets',
        raw: true,
      });

      // Should have at least 3 budgets per spec
      expect(budgetsRes.length).toBeGreaterThanOrEqual(3);
    });

    it('seeds categories', async () => {
      const categoriesRes = await makeRequest({
        method: 'get',
        url: '/categories',
        raw: true,
      });

      // Demo users should have default categories plus any custom ones
      expect(categoriesRes.length).toBeGreaterThan(0);
    });

    it('seeds a crypto portfolio with BTC/ETH/SOL holdings', async () => {
      const portfoliosRes = await makeRequest({
        method: 'get',
        url: '/investments/portfolios',
        raw: true,
      });

      const cryptoPortfolio = portfoliosRes.data.find((p: { name: string }) => p.name === 'Crypto Portfolio');
      expect(cryptoPortfolio).toBeDefined();

      // getHoldings controller returns `{ data: holdings }`; createController
      // sends `response = result.data`, so `raw` unwraps straight to the array.
      const holdings = await makeRequest({
        method: 'get',
        url: `/investments/portfolios/${cryptoPortfolio.id}/holdings`,
        raw: true,
      });

      expect(Array.isArray(holdings)).toBe(true);
      expect(holdings.length).toBe(3);

      const symbols = holdings.map((h: { security?: { symbol: string } }) => h.security?.symbol);
      expect(symbols).toEqual(expect.arrayContaining(['BTC', 'ETH', 'SOL']));

      // Every seeded holding is a crypto-class security
      for (const holding of holdings) {
        expect(holding.security?.assetClass).toBe(ASSET_CLASS.crypto);
      }
    });

    it('seeds 2 vehicles, one with a mid-term value override', async () => {
      // getVehicles returns `{ data: [...] }`, unwrapped by `raw` to the array.
      const vehicles = await makeRequest({
        method: 'get',
        url: '/vehicles',
        raw: true,
      });

      expect(vehicles.length).toBe(2);

      const bmw = vehicles.find((v: { make: string }) => v.make === 'BMW');
      const toyota = vehicles.find((v: { make: string }) => v.make === 'Toyota');
      expect(bmw).toBeDefined();
      expect(toyota).toBeDefined();

      // The 5-year-old luxury car carries a manual override (anchored value);
      // the newer sedan rides the default depreciation curve with no anchor.
      expect(bmw.vehicleClass).toBe(VEHICLE_CLASS.luxury);
      expect(bmw.valueAnchor).not.toBeNull();
      expect(bmw.valueAnchorDate).not.toBeNull();

      expect(toyota.vehicleClass).toBe(VEHICLE_CLASS.sedan);
      expect(toyota.valueAnchor).toBeNull();
    });

    it('seeds 3 venture deals (exited, written off, in progress) on a platform', async () => {
      // List controllers return `{ data: { data: [...], pagination } }`;
      // createController unwraps one level, so `raw` yields `{ data, pagination }`.
      const dealsRes = await makeRequest({
        method: 'get',
        url: '/venture/deals',
        raw: true,
      });

      const deals = dealsRes.data;
      expect(deals.length).toBe(3);

      const statuses = deals.map((d: { status: string }) => d.status);
      expect(statuses).toContain(VENTURE_DEAL_STATUS.fully_exited);
      expect(statuses).toContain(VENTURE_DEAL_STATUS.written_off);
      expect(statuses).toContain(VENTURE_DEAL_STATUS.outstanding);

      // The in-progress deal must carry a live (non-zero) current value — that's
      // the whole point of seeding it alongside the two $0 terminal deals.
      const outstanding = deals.find((d: { status: string }) => d.status === VENTURE_DEAL_STATUS.outstanding);
      expect(outstanding).toBeDefined();

      const metrics = await makeRequest({
        method: 'get',
        url: `/venture/deals/${outstanding.id}/metrics`,
        raw: true,
      });
      expect(Number(metrics.currentValue)).toBeGreaterThan(0);

      const platformsRes = await makeRequest({
        method: 'get',
        url: '/venture/platforms',
        raw: true,
      });
      const platforms = platformsRes.data;
      expect(platforms.some((p: { name: string }) => p.name === 'AngelList')).toBe(true);
    });

    it('seeds 3 small consumer loans (auto, student, personal) partially paid down', async () => {
      // GET /loans returns a flat array (unwrapped by `raw`), each row carrying
      // Account fields plus nested loanDetails and projection.
      const loans = await makeRequest({
        method: 'get',
        url: '/loans',
        raw: true,
      });

      expect(loans.length).toBe(3);

      const car = loans.find((l: { name: string }) => l.name === 'Car Loan');
      const student = loans.find((l: { name: string }) => l.name === 'Student Loan');
      const personal = loans.find((l: { name: string }) => l.name === 'Personal Loan');
      expect(car).toBeDefined();
      expect(student).toBeDefined();
      expect(personal).toBeDefined();

      expect(car.accountCategory).toBe(ACCOUNT_CATEGORIES.loan);
      expect(car.loanDetails.loanType).toBe(LOAN_TYPE.auto);
      expect(student.loanDetails.loanType).toBe(LOAN_TYPE.student);
      expect(personal.loanDetails.loanType).toBe(LOAN_TYPE.personal);

      for (const loan of loans) {
        // Outstanding is stored negative (liability convention) and each loan is
        // deliberately small (≤ $25k) and partially paid down, so the
        // outstanding sits strictly between $0 and the original principal.
        expect(loan.currentBalance).toBeLessThan(0);
        expect(Math.abs(loan.currentBalance)).toBeLessThan(loan.loanDetails.originalPrincipal);
        expect(loan.loanDetails.originalPrincipal).toBeLessThanOrEqual(25_000_00);
        expect(loan.projection.isPaidOff).toBe(false);
      }
    });
  });

  describe('Enriched Demo Dataset', () => {
    let demoSessionToken: string;

    beforeEach(async () => {
      const demoUser = await createDemoUserAndAuth();
      demoSessionToken = demoUser.sessionToken;
    }, 60000); // 60s timeout - demo user creation involves lots of data

    afterEach(() => {
      if (demoSessionToken) {
        clearMockSession(demoSessionToken);
      }
    });

    /**
     * One high-limit page of the demo history. The seeded dataset is ~1.5k rows,
     * so a single fetch avoids paging logic in every assertion below.
     */
    const fetchTransactions = async (params: Record<string, string | number> = {}): Promise<DemoTransactionRow[]> => {
      const rows = await makeRequest({
        method: 'get',
        url: '/transactions',
        payload: { limit: 5000, ...params },
        raw: true,
      });

      expect(Array.isArray(rows)).toBe(true);
      return rows as DemoTransactionRow[];
    };

    it('seeds payees with logo domains and links transactions to them', async () => {
      const payees = await makeRequest({
        method: 'get',
        url: '/payees',
        payload: { limit: 200 },
        raw: true,
      });

      expect(Array.isArray(payees)).toBe(true);
      expect(payees.length).toBeGreaterThan(30);

      // Every seeded payee mirrors its merchant entry: a domain when the
      // merchant declares one, none for fictional companies (Acme Corp and
      // friends), which render as monograms. `logoSource: 'manual'` either way,
      // or the brand-logo worker does a network lookup per merchant on every
      // demo signup.
      const domainByName = new Map(allDemoPayeeMerchants().map((merchant) => [merchant.name, merchant.domain ?? null]));
      for (const payee of payees as { name: string; logoDomain: string | null }[]) {
        expect(domainByName.has(payee.name)).toBe(true);
        expect(payee.logoDomain).toBe(domainByName.get(payee.name));
      }

      const withTransactions = (payees as { stats: { transactionCount: number } | null }[]).filter(
        (payee) => (payee.stats?.transactionCount ?? 0) > 0,
      );
      expect(withTransactions.length).toBeGreaterThan(0);

      const transactions = await fetchTransactions();
      expect(transactions.filter((tx) => tx.payeeId !== null).length).toBeGreaterThan(0);
    });

    it('attaches the default and demo-only tags to transactions', async () => {
      const tags = await makeRequest({
        method: 'get',
        url: '/tags',
        raw: true,
      });

      // Three defaults every user gets plus the three demo-only ones. The default
      // names are translated, so only the demo-only names are matched by name.
      expect(tags.length).toBeGreaterThanOrEqual(6);
      const tagNames = (tags as { name: string }[]).map((tag) => tag.name);
      expect(tagNames).toEqual(expect.arrayContaining(['Reimbursable', 'Vacation', 'Subscription']));

      const transactions = await fetchTransactions({ includeTags: 'true' });
      const tagged = transactions.filter((tx) => (tx.tags?.length ?? 0) > 0);
      expect(tagged.length).toBeGreaterThan(0);

      const usedTagIds = new Set(tagged.flatMap((tx) => tx.tags!.map((tag) => tag.id)));
      expect(usedTagIds.size).toBeGreaterThan(1);
    });

    it('seeds transfers as paired legs worth the same in the base currency', async () => {
      const transfers = await fetchTransactions({
        transferNatures: TRANSACTION_TRANSFER_NATURE.common_transfer,
      });

      expect(transfers.length).toBeGreaterThan(0);

      const legsByTransferId = new Map<string, DemoTransactionRow[]>();
      for (const tx of transfers) {
        expect(tx.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);
        expect(tx.transferId).not.toBeNull();
        const legs = legsByTransferId.get(tx.transferId!) ?? [];
        legs.push(tx);
        legsByTransferId.set(tx.transferId!, legs);
      }

      expect(legsByTransferId.size).toBeGreaterThan(0);

      let crossCurrencyPairs = 0;

      for (const legs of legsByTransferId.values()) {
        expect(legs).toHaveLength(2);

        const income = legs.filter((leg) => leg.transactionType === TRANSACTION_TYPES.income);
        const expense = legs.filter((leg) => leg.transactionType === TRANSACTION_TYPES.expense);
        expect(income).toHaveLength(1);
        expect(expense).toHaveLength(1);
        expect(income[0]!.accountId).not.toBe(expense[0]!.accountId);

        // Both legs must be worth the same in the base currency; converting each
        // leg at its own rate would let a transfer create or destroy net worth.
        expect(income[0]!.refAmount).toBe(expense[0]!.refAmount);

        if (income[0]!.currencyCode !== expense[0]!.currencyCode) {
          crossCurrencyPairs += 1;
        }
      }

      expect(crossCurrencyPairs).toBeGreaterThan(0);
    });

    it('seeds splits that add up to their parent transaction', async () => {
      const transactions = await fetchTransactions({ includeSplits: 'true' });
      const withSplits = transactions.filter((tx) => (tx.splits?.length ?? 0) > 0);

      expect(withSplits.length).toBeGreaterThan(0);

      for (const tx of withSplits) {
        // Compared in cents: the API speaks decimals, and summing those directly
        // makes the totals drift by fractions of a cent.
        const splitTotal = tx.splits!.reduce((sum, split) => sum + Math.round(split.amount * 100), 0);
        expect(splitTotal).toBe(Math.round(tx.amount * 100));
      }
    });

    it('seeds refund pairs with both sides flagged and pointing opposite ways', async () => {
      const refunds = await makeRequest({
        method: 'get',
        url: '/transactions/refunds',
        payload: { page: 1, limit: 20 },
        raw: true,
      });

      expect(refunds.meta.total).toBeGreaterThan(0);
      expect(refunds.data.length).toBeGreaterThan(0);

      for (const link of refunds.data as {
        originalTransaction: DemoTransactionRow;
        refundTransaction: DemoTransactionRow;
      }[]) {
        expect(link.originalTransaction.refundLinked).toBe(true);
        expect(link.refundTransaction.refundLinked).toBe(true);
        expect(link.originalTransaction.transactionType).toBe(TRANSACTION_TYPES.expense);
        expect(link.refundTransaction.transactionType).toBe(TRANSACTION_TYPES.income);
      }
    });

    it('seeds subscriptions with an open period and paid history', async () => {
      const subscriptions = await makeRequest({
        method: 'get',
        url: '/subscriptions',
        raw: true,
      });

      expect(subscriptions.length).toBeGreaterThan(0);

      let totalLinkedTransactions = 0;

      for (const subscription of subscriptions as {
        id: string;
        currentPeriod: { id: string; dueDate: string; status: string } | null;
        linkedTransactionsCount: number;
      }[]) {
        // An open period is what makes the due-date chip and "Mark paid" reachable.
        expect(subscription.currentPeriod).not.toBeNull();
        expect(subscription.currentPeriod!.dueDate).toBeTruthy();
        totalLinkedTransactions += subscription.linkedTransactionsCount;
      }

      expect(totalLinkedTransactions).toBeGreaterThan(0);

      const firstSubscription = subscriptions[0];
      const periodsRes = await makeRequest({
        method: 'get',
        url: `/subscriptions/${firstSubscription.id}/periods`,
        payload: { limit: 50 },
        raw: true,
      });

      expect(periodsRes.total).toBeGreaterThan(1);

      const paidPeriods = (periodsRes.periods as { status: string; transactionId: string | null }[]).filter(
        (period) => period.status === SUBSCRIPTION_PERIOD_STATUSES.paid,
      );
      expect(paidPeriods.length).toBeGreaterThan(0);

      for (const period of paidPeriods) {
        expect(period.transactionId).not.toBeNull();
      }
    });

    it('seeds category budgets over a window with plausible utilization', async () => {
      const budgets = await makeRequest({
        method: 'get',
        url: '/budgets',
        raw: true,
      });

      expect(budgets.length).toBeGreaterThanOrEqual(3);

      for (const budget of budgets as {
        id: string;
        type: string;
        startDate: string | null;
        endDate: string | null;
        categories: unknown[];
      }[]) {
        // `category` is what writes the BudgetCategories rows the stats read; a
        // `manual` budget with no linked transactions would report zero spend.
        expect(budget.type).toBe(BUDGET_TYPES.category);
        expect(budget.startDate).not.toBeNull();
        expect(budget.endDate).not.toBeNull();
        expect(budget.categories.length).toBeGreaterThan(0);

        const stats = await makeRequest({
          method: 'get',
          url: `/budgets/${budget.id}/stats`,
          raw: true,
        });

        expect(stats.summary.actualExpense).toBeGreaterThan(0);
        expect(Number.isFinite(stats.summary.utilizationRate)).toBe(true);
        expect(stats.summary.utilizationRate).toBeGreaterThan(0);
        // Sanity band on the date window: a budget without one totals all three
        // years of history against a one-month limit and blows far past this.
        expect(stats.summary.utilizationRate).toBeLessThan(400);
      }
    });

    it('seeds account groups with accounts attached', async () => {
      const groups = await makeRequest({
        method: 'get',
        url: '/account-group',
        raw: true,
      });

      expect(groups.length).toBeGreaterThanOrEqual(3);

      const typedGroups = groups as {
        name: string;
        accounts: { id: string }[];
        logoInitials: string | null;
        logoColor: string | null;
      }[];
      const populated = typedGroups.filter((group) => group.accounts.length > 0);
      expect(populated.length).toBeGreaterThanOrEqual(3);

      // Each configured group is seeded with its exact monogram. Both logo fields
      // are required in the config, so dropping one is a type error rather than a
      // silently passing test.
      expect(populated.map(({ name, logoInitials, logoColor }) => ({ name, logoInitials, logoColor }))).toEqual(
        expect.arrayContaining(
          DEMO_ACCOUNT_GROUPS.map(({ name, logoInitials, logoColor }) => ({ name, logoInitials, logoColor })),
        ),
      );

      for (const group of populated) {
        expect(group.logoColor).toMatch(/^#[0-9a-f]{6}$/);
      }

      // Each of the 4 cash accounts lands in exactly one group.
      const groupedAccountIds = new Set(typedGroups.flatMap((group) => group.accounts.map((account) => account.id)));
      expect(groupedAccountIds.size).toBe(4);

      // Vehicles and loans are presented as their own entities (Vehicles section,
      // /loans page) and the accounts UI filters them out of the manual list, so
      // grouping them would leave the group rendering empty.
      const accountsRes = await makeRequest({
        method: 'get',
        url: '/accounts',
        raw: true,
      });
      const dedicatedFlowAccountIds = accountsRes
        .filter(
          (account: { accountCategory: string }) =>
            account.accountCategory === ACCOUNT_CATEGORIES.vehicle ||
            account.accountCategory === ACCOUNT_CATEGORIES.loan,
        )
        .map((account: { id: string }) => account.id);

      expect(dedicatedFlowAccountIds.length).toBeGreaterThan(0);
      for (const accountId of dedicatedFlowAccountIds) {
        expect(groupedAccountIds.has(accountId)).toBe(false);
      }
    });

    it('seeds transaction groups holding at least two transactions', async () => {
      const groups = await makeRequest({
        method: 'get',
        url: '/transaction-groups',
        raw: true,
      });

      expect(groups.length).toBeGreaterThan(0);

      // The service refuses a group smaller than two, so any seeded group that
      // came out short means members were silently dropped.
      for (const group of groups as { transactionCount: number }[]) {
        expect(group.transactionCount).toBeGreaterThanOrEqual(2);
      }
    });

    it('backfills a price series for every demo security', async () => {
      const portfoliosRes = await makeRequest({
        method: 'get',
        url: '/investments/portfolios',
        raw: true,
      });

      const securityIds: string[] = [];
      for (const portfolio of portfoliosRes.data as { id: string }[]) {
        const holdings = await makeRequest({
          method: 'get',
          url: `/investments/portfolios/${portfolio.id}/holdings`,
          raw: true,
        });

        for (const holding of holdings as { security?: { id: string } }[]) {
          if (holding.security) securityIds.push(holding.security.id);
        }
      }

      expect(securityIds.length).toBe(6);

      // No endpoint exposes the raw pricing series, so this reads it directly
      // from the table the historical net-worth chart resolves prices through.
      const [pricingRows] = await connection.sequelize.query(
        `SELECT "securityId", COUNT(*) as "rowCount", MIN(date) as "firstDate", MAX(date) as "lastDate"
         FROM "SecurityPricings" WHERE "securityId" IN (:securityIds) GROUP BY "securityId"`,
        { replacements: { securityIds } },
      );

      const series = pricingRows as { securityId: string; rowCount: string; firstDate: Date; lastDate: Date }[];
      expect(series.length).toBe(securityIds.length);

      let longestSpanDays = 0;

      for (const row of series) {
        // A single row dated today makes every earlier bucket fall back to cost
        // basis, which draws the net-worth chart flat and then cliffs it.
        expect(Number(row.rowCount)).toBeGreaterThan(1);

        const spanDays = (new Date(row.lastDate).getTime() - new Date(row.firstDate).getTime()) / 86400000;
        expect(spanDays).toBeGreaterThan(250);
        longestSpanDays = Math.max(longestSpanDays, spanDays);
      }

      // Purchases are spread across the history window, so the oldest holding
      // carries market prices across most of the net-worth chart.
      expect(longestSpanDays).toBeGreaterThan(700);
    });

    it('files transactions under subcategories, not only top-level categories', async () => {
      const categories = await makeRequest({
        method: 'get',
        url: '/categories',
        raw: true,
      });

      const subcategoryIds = new Set(
        (categories as { id: string; parentId: string | null }[])
          .filter((category) => category.parentId !== null)
          .map((category) => category.id),
      );
      expect(subcategoryIds.size).toBeGreaterThan(0);

      const transactions = await fetchTransactions();
      const categorized = transactions.filter((tx) => tx.categoryId !== null);
      expect(categorized.length).toBeGreaterThan(0);

      const inSubcategory = categorized.filter((tx) => subcategoryIds.has(tx.categoryId!));
      expect(inSubcategory.length).toBeGreaterThan(0);
      expect(inSubcategory.length / categorized.length).toBeGreaterThan(0.5);
    });
  });

  describe('Demo User Restrictions', () => {
    let demoSessionToken: string;

    beforeEach(async () => {
      const demoUser = await createDemoUserAndAuth();
      demoSessionToken = demoUser.sessionToken;
    }, 60000); // 60s timeout - demo user creation involves lots of data

    afterEach(() => {
      if (demoSessionToken) {
        clearMockSession(demoSessionToken);
      }
    });

    it('blocks bank connection endpoints for demo users', async () => {
      // Try to connect to a bank provider - this should be blocked for demo users
      const res = await makeRequest({
        method: 'post',
        url: '/bank-data-providers/monobank/connect',
        payload: { token: 'fake-token' },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.status).toBe(API_RESPONSE_STATUS.error);
      expect(res.body.response.code).toBe(API_ERROR_CODES.forbidden);
      expect(res.body.response.message).toContain('demo mode');
    });

    it('allows demo users to view the seeded investment portfolios', async () => {
      const res = await makeRequest({
        method: 'get',
        url: '/investments/portfolios',
        raw: true,
      });

      expect(Array.isArray(res.data)).toBe(true);
      const names = res.data.map((p: { name: string }) => p.name);
      expect(names).toContain('Growth Portfolio');
      expect(names).toContain('Crypto Portfolio');
    });

    it('blocks investment portfolio creation for demo users', async () => {
      const res = await makeRequest({
        method: 'post',
        url: '/investments/portfolios',
        payload: { name: 'Test Portfolio', portfolioType: 'investment' },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.status).toBe(API_RESPONSE_STATUS.error);
      expect(res.body.response.code).toBe(API_ERROR_CODES.forbidden);
    });

    it('blocks password change for demo users', async () => {
      const res = await makeRequest({
        method: 'post',
        url: '/auth/set-password',
        payload: {
          newPassword: 'newpassword123',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.status).toBe(API_RESPONSE_STATUS.error);
      expect(res.body.response.code).toBe(API_ERROR_CODES.forbidden);
    });

    it('blocks AI categorization trigger for demo users', async () => {
      // Without a user AI key, this endpoint falls back to the operator's
      // server-side key — demo users must not reach it.
      const res = await makeRequest({
        method: 'post',
        url: '/user/ai/categorization/trigger',
        payload: {},
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.status).toBe(API_RESPONSE_STATUS.error);
      expect(res.body.response.code).toBe(API_ERROR_CODES.forbidden);
    });

    it('allows regular feature usage for demo users', async () => {
      // Demo users can still use core features like viewing accounts
      const res = await makeRequest({
        method: 'get',
        url: '/accounts',
      });

      expect(res.statusCode).toBe(200);
    });

    it('allows transaction creation for demo users', async () => {
      // Get an account first
      const accountsRes = await makeRequest({
        method: 'get',
        url: '/accounts',
        raw: true,
      });

      expect(accountsRes.length).toBeGreaterThan(0);
      const accountId = accountsRes[0].id;

      // Get a category
      const categoriesRes = await makeRequest({
        method: 'get',
        url: '/categories',
        raw: true,
      });

      const category = categoriesRes.find((c: { parentId: number | null }) => c.parentId !== null);
      expect(category).toBeDefined();

      // Create a transaction
      const res = await makeRequest({
        method: 'post',
        url: '/transactions',
        payload: {
          amount: 10, // API accepts decimal amounts (e.g., $10.00)
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
          accountId,
          time: new Date().toISOString(),
          paymentType: PAYMENT_TYPES.debitCard,
          transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
        },
      });

      expect(res.statusCode).toBe(200);
    });
  });

  describe('Demo User Cleanup', () => {
    // Skip: This test requires real better-auth (not mocked) to trigger session hooks
    // that call cleanupDemoUser(). The mock returns 200 but doesn't run the actual
    // session deletion flow. Cleanup functionality is tested via cleanupExpiredDemoUsers.
    it.skip('cleans up demo user on signout', async () => {
      // Create a demo user with mock session registration
      const { userId, authUserId, sessionToken } = await createDemoUserAndAuth();

      // Signout - this should trigger demo user cleanup
      const signoutRes = await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-out',
      });

      expect(signoutRes.statusCode).toBe(200);

      // Clear the mock session since user is being deleted
      clearMockSession(sessionToken);

      // Wait for async cleanup to complete (cleanup is fire-and-forget)
      // Use polling with longer timeout to handle variable execution time
      // Demo users have lots of data to clean up (~1500 transactions)
      let userDeleted = false;
      for (let i = 0; i < 100; i++) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        const userCheck = await Users.findByPk(userId);
        if (!userCheck) {
          userDeleted = true;
          break;
        }
      }

      expect(userDeleted).toBe(true);

      // Verify ba_user is deleted
      const baUsersResult = await authPool.query('SELECT * FROM ba_user WHERE id = $1', [authUserId]);
      expect(baUsersResult.rows).toHaveLength(0);
    }, 60000); // 60 second timeout - demo user creation and cleanup involves lots of data

    it('cleanupExpiredDemoUsers removes old demo accounts', async () => {
      // Import the cleanup function directly for testing
      const { cleanupExpiredDemoUsers } = await import('./cleanup-demo-users.service');

      // Create a demo user
      global.APP_AUTH_COOKIES = null;

      const createRes = await makeAuthRequest({
        method: 'post',
        url: '/demo',
      });

      expect(createRes.statusCode).toBe(200);
      const userId = createRes.body.response.user.id;

      // Manually backdate the user's createdAt to make it "expired"
      await Users.update(
        { createdAt: new Date(Date.now() - 7 * 60 * 60 * 1000) }, // 7 hours ago
        { where: { id: userId } },
      );

      // Run cleanup
      const cleanedCount = await cleanupExpiredDemoUsers();

      expect(cleanedCount).toBeGreaterThanOrEqual(1);

      // Verify user is deleted
      const user = await Users.findByPk(userId);
      expect(user).toBeNull();
    }, 60000); // 60s timeout - demo user creation involves lots of data

    it('cleanupExpiredDemoUsers does not remove fresh demo accounts', async () => {
      const { cleanupExpiredDemoUsers } = await import('./cleanup-demo-users.service');

      // Create a demo user
      global.APP_AUTH_COOKIES = null;

      const createRes = await makeAuthRequest({
        method: 'post',
        url: '/demo',
      });

      expect(createRes.statusCode).toBe(200);
      const userId = createRes.body.response.user.id;

      // Run cleanup without modifying createdAt (user is fresh)
      await cleanupExpiredDemoUsers();

      // Fresh demo user should NOT be cleaned up
      const user = await Users.findByPk(userId);
      expect(user).not.toBeNull();
    }, 60000); // 60s timeout - demo user creation involves lots of data

    // Skip: This test has issues with Sequelize queries when running in the mocked
    // environment. The cascade deletion is verified indirectly by cleanupExpiredDemoUsers tests.
    it.skip('cascade deletes all user data on cleanup', async () => {
      const { cleanupDemoUser } = await import('./cleanup-demo-users.service');

      // Create a demo user with mock session registration
      const { userId, sessionToken } = await createDemoUserAndAuth();

      // Verify demo data exists
      const accountsBefore = await makeRequest({
        method: 'get',
        url: '/accounts',
        raw: true,
      });
      expect(accountsBefore.length).toBeGreaterThan(0);

      // Clear mock session and restore original cookies before cleanup
      clearMockSession(sessionToken);
      global.APP_AUTH_COOKIES = originalAuthCookies;

      // Manually cleanup the demo user
      await cleanupDemoUser({ userId });

      // Verify user is deleted
      const user = await Users.findByPk(userId);
      expect(user).toBeNull();

      // Verify accounts are deleted (query directly since user is gone)
      const [accounts] = await connection.sequelize.query('SELECT * FROM accounts WHERE "userId" = :userId', {
        replacements: { userId },
      });
      expect(accounts).toHaveLength(0);

      // Verify transactions are deleted
      const [transactions] = await connection.sequelize.query('SELECT * FROM transactions WHERE "userId" = :userId', {
        replacements: { userId },
      });
      expect(transactions).toHaveLength(0);
    }, 60000); // 60s timeout - demo user creation and cleanup involves lots of data
  });

  describe('Template-based Demo Data Integrity', () => {
    let demoSessionToken: string;

    beforeEach(async () => {
      const demoUser = await createDemoUserAndAuth();
      demoSessionToken = demoUser.sessionToken;
    }, 60000);

    afterEach(() => {
      if (demoSessionToken) {
        clearMockSession(demoSessionToken);
      }
    });

    it('account balances reflect transaction totals', async () => {
      // Get accounts
      const accountsRes = await makeRequest({
        method: 'get',
        url: '/accounts',
        raw: true,
      });

      // Vehicle accounts are depreciation-driven and loan accounts are
      // balance-anchor-driven: neither balance is `initialBalance + Σtx`, so
      // exclude them here.
      const cashAccounts = accountsRes.filter(
        (a: { accountCategory: string }) =>
          a.accountCategory !== ACCOUNT_CATEGORIES.vehicle && a.accountCategory !== ACCOUNT_CATEGORIES.loan,
      );
      expect(cashAccounts.length).toBe(4);

      // For each cash account, verify currentBalance = initialBalance + sum of transactions
      for (const account of cashAccounts) {
        // Get all transactions for this account directly via SQL to get raw cents
        const [txRows] = await connection.sequelize.query(
          `SELECT "transactionType", amount FROM "Transactions" WHERE "accountId" = :accountId`,
          { replacements: { accountId: account.id } },
        );

        const txSum = (txRows as { transactionType: string; amount: number }[]).reduce((sum, tx) => {
          if (tx.transactionType === TRANSACTION_TYPES.income) {
            return sum + tx.amount;
          }
          return sum - tx.amount;
        }, 0);

        // Get raw account balance values from DB
        const [accountRows] = await connection.sequelize.query(
          `SELECT "currentBalance", "initialBalance" FROM "Accounts" WHERE id = :id`,
          { replacements: { id: account.id } },
        );

        const rawAccount = (accountRows as { currentBalance: number; initialBalance: number }[])[0]!;
        expect(rawAccount.currentBalance).toBe(rawAccount.initialBalance + txSum);
      }
    });

    it('balances history table has records for demo accounts', async () => {
      // Get account IDs
      const accountsRes = await makeRequest({
        method: 'get',
        url: '/accounts',
        raw: true,
      });

      const accountIds = accountsRes.map((a: { id: number }) => a.id);
      // 4 cash accounts + 2 vehicle accounts + 3 loan accounts
      expect(accountIds.length).toBe(9);

      // Verify Balances records exist
      const [balanceRows] = await connection.sequelize.query(
        `SELECT COUNT(*) as count FROM "Balances" WHERE "accountId" IN (:accountIds)`,
        { replacements: { accountIds } },
      );

      const balanceCount = parseInt((balanceRows as { count: string }[])[0]!.count, 10);

      // Should have a meaningful number of balance records (at least one per account)
      expect(balanceCount).toBeGreaterThanOrEqual(accountIds.length);
    });

    it('balances history has correct running totals', async () => {
      // Get the main checking account (USD)
      const accountsRes = await makeRequest({
        method: 'get',
        url: '/accounts',
        raw: true,
      });

      const mainChecking = accountsRes.find((a: { name: string }) => a.name === 'Main Checking');
      expect(mainChecking).toBeDefined();

      // Get the latest balance record for this account
      const [latestBalanceRows] = await connection.sequelize.query(
        `SELECT amount FROM "Balances" WHERE "accountId" = :accountId ORDER BY date DESC LIMIT 1`,
        { replacements: { accountId: mainChecking.id } },
      );

      const latestBalance = (latestBalanceRows as { amount: number }[])[0];
      expect(latestBalance).toBeDefined();

      // Get refCurrentBalance from the account
      const [accountRows] = await connection.sequelize.query(
        `SELECT "refCurrentBalance" FROM "Accounts" WHERE id = :id`,
        { replacements: { id: mainChecking.id } },
      );

      const refCurrentBalance = (accountRows as { refCurrentBalance: number }[])[0]!.refCurrentBalance;

      // The latest balance record should match the account's refCurrentBalance
      // (since main checking is in USD which is the base currency)
      expect(latestBalance!.amount).toBe(refCurrentBalance);
    });
  });

  describe('Demo vs Regular User Differentiation', () => {
    it('regular users do not have demo restrictions', async () => {
      // Use the default test user (regular user)
      global.APP_AUTH_COOKIES = originalAuthCookies;

      // Regular user can access investment portfolios (blocked for demo users)
      const res = await makeRequest({
        method: 'get',
        url: '/investments/portfolios',
      });

      // Should get 200 (not 403 forbidden)
      expect(res.statusCode).toBe(200);
    });

    it('regular user logout does not trigger cleanup', async () => {
      // Get the test user ID before signout
      const userRes = await makeRequest({
        method: 'get',
        url: '/user',
        raw: true,
      });

      const userId = userRes.id;

      // Signout
      await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-out',
      });

      // Wait a moment
      await new Promise((resolve) => setTimeout(resolve, 100));

      // User should still exist (not cleaned up)
      const user = await Users.findByPk(userId);
      expect(user).not.toBeNull();
    });
  });
});
