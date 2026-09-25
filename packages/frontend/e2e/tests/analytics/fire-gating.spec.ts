import { type Page, type Request, expect, test } from '@playwright/test';

import {
  API_BASE_URL,
  apiPatch,
  completeOnboarding,
  createAccount,
  createCategory,
  createTransaction,
  extractId,
} from '../../helpers/api-client';
import { loginViaUI } from '../../helpers/auth';
import { pastMonthIso } from '../../helpers/fire';
import { buildTestCredentials, signUpAndVerify } from '../../helpers/test-setup';

// FIRE planner is a Plus feature. Without it the user gets a 14-day trial that starts on the
// first FIRE page open; once it ends the page and the dashboard widget are locked.

const DAY_MS = 86_400_000;
const TRIAL_DAYS = 14;
const FIRE_FEATURE = 'fire_planner';
const TRIAL_PATH = `/api/v1/user/feature-trials/${FIRE_FEATURE}`;

type FeatureTrial = { startedAt: string; endsAt: string };

const trialFrom = ({ startedDaysAgo, endsInDays }: { startedDaysAgo: number; endsInDays: number }): FeatureTrial => ({
  startedAt: new Date(Date.now() - startedDaysAgo * DAY_MS).toISOString(),
  endsAt: new Date(Date.now() + endsInDays * DAY_MS).toISOString(),
});

const isTrialStart = ({ request }: { request: Request }) =>
  request.method() === 'POST' && request.url().includes(TRIAL_PATH);
const isSettingsWrite = ({ request }: { request: Request }) =>
  request.method() !== 'GET' && request.url().includes('/api/v1/user/settings');

/**
 * Serves /user as a user without Plus (and outside the account trial) whose FIRE trial is `trial`.
 * An active trial is merged into `features`, as the backend does. POST starts a 14-day trial.
 */
async function mockEntitlements({ page, trial }: { page: Page; trial: FeatureTrial | null }) {
  const state = { trial };
  const entitlementsFor = ({ base }: { base: Record<string, unknown> }) => {
    const active = state.trial !== null && new Date(state.trial.endsAt).getTime() > Date.now();
    const features = (base.features as string[]).filter((feature) => feature !== FIRE_FEATURE);
    return {
      ...base,
      features: active ? [...features, FIRE_FEATURE] : features,
      featureTrials: state.trial ? { [FIRE_FEATURE]: state.trial } : {},
    };
  };

  await page.route('**/api/v1/user', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const response = await route.fetch();
    const body = await response.json();
    body.response.entitlements = entitlementsFor({ base: body.response.entitlements });
    await route.fulfill({ response, json: body });
  });

  await page.route(`**${TRIAL_PATH}`, async (route) => {
    const userResponse = await page.request.get(`${API_BASE_URL}/api/v1/user`);
    const { response: user } = await userResponse.json();
    state.trial = state.trial ?? trialFrom({ startedDaysAgo: 0, endsInDays: TRIAL_DAYS });
    await route.fulfill({
      status: 200,
      json: { status: 'success', response: entitlementsFor({ base: user.entitlements }) },
    });
  });

  return state;
}

function recordRequests({ page, match }: { page: Page; match: (params: { request: Request }) => boolean }): Request[] {
  const seen: Request[] = [];
  page.on('request', (request) => {
    if (match({ request })) seen.push(request);
  });
  return seen;
}

const lockOverlay = ({ page }: { page: Page }) => page.getByText('Included in the Plus plan');
const heroEta = ({ page }: { page: Page }) => page.locator('main').getByText(/Time to FIRE/i);
const fireRing = ({ page }: { page: Page }) => page.getByRole('img', { name: /of FIRE target reached/ });
const lockedTeaser = ({ page }: { page: Page }) => page.locator('[data-widget-id="fire-progress"]');

const creds = buildTestCredentials({ prefix: 'fireg' });
let seeded = false;

test.describe('FIRE planner gating', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeAll(async () => {
    await signUpAndVerify({ creds });
  });

  test.beforeEach(async ({ page }) => {
    await loginViaUI({ page, email: creds.email, password: creds.password });
    if (seeded) return;

    const request = page.request;
    await completeOnboarding({ request, currencyCode: 'USD' });
    const accountId = extractId(
      await createAccount({ request, name: 'Savings', currencyCode: 'USD', initialBalance: 100_000 }),
    );
    const salaryId = extractId(await createCategory({ request, name: 'Gating Salary', color: '#2e7d32' }));
    for (let monthsAgo = 1; monthsAgo <= 4; monthsAgo++) {
      const time = pastMonthIso({ monthsAgo });
      await createTransaction({
        request,
        accountId,
        amount: 5_000,
        transactionType: 'income',
        categoryId: salaryId,
        time,
      });
      await createTransaction({ request, accountId, amount: 3_000, time });
    }
    await apiPatch({
      request,
      path: '/api/v1/user/settings',
      data: { dashboard: { widgets: [{ widgetId: 'fire-progress', colSpan: 1, rowSpan: 1 }] } },
    });
    seeded = true;
  });

  test('during the account trial the page is open and no FIRE trial is spent', async ({ page }) => {
    const trialStarts = recordRequests({ page, match: isTrialStart });

    await page.goto('/analytics/fire');
    await expect(heroEta({ page })).toBeVisible({ timeout: 15_000 });
    await expect(lockOverlay({ page })).toBeHidden();
    await expect(page.getByText(/FIRE planner trial/i)).toBeHidden();

    await page.goto('/dashboard');
    await expect(fireRing({ page })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: 'Unlock' })).toHaveCount(0);
    expect(trialStarts).toHaveLength(0);
  });

  test('without Plus the widget teaser leads to the page, whose first open starts a 14-day trial', async ({ page }) => {
    await mockEntitlements({ page, trial: null });
    const trialStarts = recordRequests({ page, match: isTrialStart });

    await page.goto('/dashboard');
    await expect(lockedTeaser({ page }).getByText('Plus feature')).toBeVisible({ timeout: 15_000 });
    expect(trialStarts).toHaveLength(0);

    await lockedTeaser({ page }).getByRole('link', { name: 'Unlock' }).click();
    await page.waitForURL(/\/analytics\/fire$/);
    await expect.poll(() => trialStarts.length).toBe(1);

    await expect(heroEta({ page })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('main')).toContainText(`FIRE planner trial · ${TRIAL_DAYS} days left`);
    await expect(lockOverlay({ page })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Adjust assumptions' })).toBeEnabled();

    await page.goto('/dashboard');
    await expect(fireRing({ page })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: 'Unlock' })).toHaveCount(0);
    expect(trialStarts).toHaveLength(1);
  });

  test('a running trial is not restarted and counts down', async ({ page }) => {
    const entitlements = await mockEntitlements({ page, trial: trialFrom({ startedDaysAgo: 11, endsInDays: 3 }) });
    const trialStarts = recordRequests({ page, match: isTrialStart });

    await page.goto('/analytics/fire');
    await expect(heroEta({ page })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('main')).toContainText('FIRE planner trial · 3 days left');
    await expect(lockOverlay({ page })).toBeHidden();

    entitlements.trial = trialFrom({ startedDaysAgo: 13.5, endsInDays: 0.5 });
    await page.reload();
    await expect(heroEta({ page })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('main')).toContainText('FIRE planner trial · 1 day left');
    expect(trialStarts).toHaveLength(0);
  });

  test('an ended trial locks the widget and the page behind a Plus upsell', async ({ page }) => {
    await mockEntitlements({ page, trial: trialFrom({ startedDaysAgo: 20, endsInDays: -6 }) });
    const trialStarts = recordRequests({ page, match: isTrialStart });

    await page.goto('/dashboard');
    const widget = lockedTeaser({ page });
    await expect(widget.getByText('Plus feature')).toBeVisible({ timeout: 15_000 });
    await expect(fireRing({ page })).toHaveCount(0);
    expect(await widget.innerText()).not.toMatch(/\d+\s*%|\d+\s*(yrs?|mos?)\b|\$\d/);

    await widget.getByRole('link', { name: 'Unlock' }).click();
    await page.waitForURL(/\/analytics\/fire$/);
    const settingsWrites = recordRequests({ page, match: isSettingsWrite });
    await expect(lockOverlay({ page })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/trial has ended/i)).toBeVisible();
    const seePlans = page.getByRole('link', { name: 'See plans' }).last();
    await expect(seePlans).toHaveAttribute('href', '/settings/plan-billing');
    await expect(page.getByText(/FIRE planner trial · \d+ days? left/)).toBeHidden();
    await expect(page.getByRole('button', { name: 'Add to dashboard' })).toHaveCount(0);

    const contribution = page
      .locator('main [inert]')
      .getByRole('spinbutton', { name: 'Monthly contribution', includeHidden: true });
    await expect(contribution).toBeAttached({ timeout: 15_000 });
    await contribution.focus();
    await expect(contribution).not.toBeFocused();
    // The failed click also outlasts the autosave debounce, so a write it caused would be recorded.
    await expect(contribution.click({ timeout: 2_000 })).rejects.toThrow();

    expect(trialStarts).toHaveLength(0);
    expect(settingsWrites).toHaveLength(0);
    await expect(lockOverlay({ page })).toBeVisible();
  });
});
