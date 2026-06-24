import { SUBSCRIPTION_FREQUENCIES, SUBSCRIPTION_TYPES } from '@bt/shared/types';
import { until } from '@common/helpers';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import BrandLogos from '@models/brand-logos.model';
import * as helpers from '@tests/helpers';
import { getLogoDevSearchMock } from '@tests/mocks/logo-dev/mock-api';

// A bill needs only a name/frequency/startDate (no amount), keeping these logo
// tests focused on the logo fields.
const buildBillPayload = (overrides: { name?: string; logoDomain?: string | null } = {}) => ({
  name: 'Rent',
  type: SUBSCRIPTION_TYPES.bill,
  frequency: SUBSCRIPTION_FREQUENCIES.monthly,
  startDate: '2024-01-01',
  ...overrides,
});

// ---------------------------------------------------------------------------
// POST /api/subscriptions  – logoDomain field (manual logo at creation time)
// ---------------------------------------------------------------------------

describe('Subscription POST logoDomain', () => {
  it('creates with logoDomain and stamps logoSource as manual', async () => {
    const created = await helpers.createSubscription({
      ...buildBillPayload({ name: 'Netflix', logoDomain: 'netflix.com' }),
      raw: true,
    });

    expect(created.logoDomain).toBe('netflix.com');
    expect(created.logoSource).toBe('manual');
  });

  it('accepts null logoDomain and stamps logoSource as manual (explicit no-logo)', async () => {
    const created = await helpers.createSubscription({
      ...buildBillPayload({ name: 'Rent', logoDomain: null }),
      raw: true,
    });

    expect(created.logoDomain).toBeNull();
    expect(created.logoSource).toBe('manual');
  });

  it('auto-resolves from the BrandLogos cache when logoDomain is omitted', async () => {
    // Seed the shared cache so the post-commit worker hits it (no logo.dev call).
    await BrandLogos.create({
      normalizedName: 'gitlab',
      domain: 'gitlab.com',
      brandName: 'GitLab',
      source: 'seed',
    });

    const created = await helpers.createSubscription({ ...buildBillPayload({ name: 'GitLab' }), raw: true });

    await until(
      async () => {
        const fetched = await helpers.getSubscriptionById({ id: created.id, raw: true });
        return fetched.logoSource !== null;
      },
      { timeout: 10_000, interval: 200 },
    );

    const resolved = await helpers.getSubscriptionById({ id: created.id, raw: true });
    expect(resolved.logoSource).toBe('auto');
    expect(resolved.logoDomain).toBe('gitlab.com');
  });

  it('keeps a manual logoDomain even when a matching BrandLogos cache entry exists', async () => {
    await BrandLogos.create({
      normalizedName: 'dropbox',
      domain: 'dropbox.com',
      brandName: 'Dropbox',
      source: 'seed',
    });

    const created = await helpers.createSubscription({
      ...buildBillPayload({ name: 'Dropbox', logoDomain: 'custom.example' }),
      raw: true,
    });

    // Give the post-commit worker a window to (wrongly) clobber the manual choice;
    // the guard must keep it intact.
    await until(
      async () => {
        const fetched = await helpers.getSubscriptionById({ id: created.id, raw: true });
        return fetched.logoSource === 'manual' && fetched.logoDomain === 'custom.example';
      },
      { timeout: 3_000, interval: 200 },
    );

    const after = await helpers.getSubscriptionById({ id: created.id, raw: true });
    expect(after.logoSource).toBe('manual');
    expect(after.logoDomain).toBe('custom.example');
  });

  it('returns 422 when logoDomain contains a space', async () => {
    const res = await helpers.createSubscription({
      ...buildBillPayload({ name: 'Bad Domain Space', logoDomain: 'has space' }),
      raw: false,
    });

    expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('returns 422 when logoDomain contains a slash', async () => {
    const res = await helpers.createSubscription({
      ...buildBillPayload({ name: 'Bad Domain Slash', logoDomain: 'x/y' }),
      raw: false,
    });

    expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/subscriptions/:id  – logoDomain field
// ---------------------------------------------------------------------------

describe('Subscription PUT logoDomain', () => {
  it('sets logoDomain and stamps logoSource as manual', async () => {
    const sub = await helpers.createSubscription({ ...buildBillPayload({ name: 'Spotify' }), raw: true });

    const updated = await helpers.updateSubscription({ id: sub.id, logoDomain: 'spotify.com', raw: true });

    expect(updated.logoDomain).toBe('spotify.com');
    expect(updated.logoSource).toBe('manual');
  });

  it('accepts null logoDomain and stamps logoSource as manual (explicit no-logo)', async () => {
    const sub = await helpers.createSubscription({
      ...buildBillPayload({ name: 'Hulu', logoDomain: 'hulu.com' }),
      raw: true,
    });

    const updated = await helpers.updateSubscription({ id: sub.id, logoDomain: null, raw: true });

    expect(updated.logoDomain).toBeNull();
    expect(updated.logoSource).toBe('manual');
  });

  it('leaves logo fields untouched when logoDomain is not included in the payload', async () => {
    const sub = await helpers.createSubscription({
      ...buildBillPayload({ name: 'Disney', logoDomain: 'disney.com' }),
      raw: true,
    });

    // Update a different field – logo fields must remain unchanged.
    const updated = await helpers.updateSubscription({ id: sub.id, name: 'Disney Plus', raw: true });

    expect(updated.logoDomain).toBe('disney.com');
    expect(updated.logoSource).toBe('manual');
  });

  it('returns 422 when logoDomain contains a slash', async () => {
    const sub = await helpers.createSubscription({ ...buildBillPayload({ name: 'Bad Update Domain' }), raw: true });

    const res = await helpers.updateSubscription({ id: sub.id, logoDomain: 'example.com/path', raw: false });

    expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('returns 404 for a subscription that does not exist', async () => {
    const res = await helpers.updateSubscription({
      id: generateRandomRecordId(),
      logoDomain: 'example.com',
      raw: false,
    });

    expect(res.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it("returns 404 when a different user tries to set another user's logoDomain", async () => {
    const sub = await helpers.createSubscription({ ...buildBillPayload({ name: 'LogoCrossUserGuard' }), raw: true });

    const handle = await helpers.signUpSecondUser();
    const response = await helpers.asUser({
      cookies: handle.cookies,
      fn: () => helpers.updateSubscription({ id: sub.id, logoDomain: 'hijack.com', raw: false }),
    });
    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// POST /api/subscriptions/:id/reset-logo
// ---------------------------------------------------------------------------

describe('Subscription reset-logo', () => {
  it('clears logoDomain and logoSource back to null', async () => {
    const sub = await helpers.createSubscription({
      ...buildBillPayload({ name: 'Apple', logoDomain: 'apple.com' }),
      raw: true,
    });

    const reset = await helpers.resetSubscriptionLogo({ id: sub.id, raw: true });

    expect(reset.logoDomain).toBeNull();
    expect(reset.logoSource).toBeNull();
  });

  it('is idempotent – resetting a subscription that already has no logo succeeds', async () => {
    const sub = await helpers.createSubscription({ ...buildBillPayload({ name: 'No Logo Bill' }), raw: true });

    const reset = await helpers.resetSubscriptionLogo({ id: sub.id, raw: true });

    expect(reset.logoDomain).toBeNull();
    expect(reset.logoSource).toBeNull();
  });

  it('re-resolves automatically after a manual logo is reset', async () => {
    await BrandLogos.create({
      normalizedName: 'slack',
      domain: 'slack.com',
      brandName: 'Slack',
      source: 'seed',
    });

    const sub = await helpers.createSubscription({
      ...buildBillPayload({ name: 'Slack', logoDomain: 'custom.example' }),
      raw: true,
    });
    expect(sub.logoSource).toBe('manual');

    // Reset clears the override and enqueues a fresh resolution after commit, so
    // the worker sees the committed null logoSource (not the stale 'manual') and
    // re-resolves from the cache.
    const reset = await helpers.resetSubscriptionLogo({ id: sub.id, raw: true });
    expect(reset.logoSource).toBeNull();

    await until(
      async () => {
        const fetched = await helpers.getSubscriptionById({ id: sub.id, raw: true });
        return fetched.logoSource === 'auto';
      },
      { timeout: 10_000, interval: 200 },
    );

    const reResolved = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    expect(reResolved.logoSource).toBe('auto');
    expect(reResolved.logoDomain).toBe('slack.com');
  });

  it('returns 404 for a subscription that does not exist', async () => {
    const res = await helpers.resetSubscriptionLogo({ id: generateRandomRecordId(), raw: false });

    expect(res.statusCode).toBe(ERROR_CODES.NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// Auto-resolution via the logo.dev provider (cache miss) + negative result
// ---------------------------------------------------------------------------

describe('Subscription logo auto-resolution', () => {
  it('resolves from the logo.dev provider and writes the result back to the cache on a cache miss', async () => {
    global.mswMockServer.use(
      getLogoDevSearchMock({
        results: [{ name: 'Figma', domain: 'figma.com', logoUrl: 'https://img.logo.dev/figma.com' }],
      }),
    );

    const sub = await helpers.createSubscription({ ...buildBillPayload({ name: 'Figma' }), raw: true });

    await until(
      async () => {
        const fetched = await helpers.getSubscriptionById({ id: sub.id, raw: true });
        return fetched.logoSource !== null;
      },
      { timeout: 10_000, interval: 200 },
    );

    const resolved = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    expect(resolved.logoDomain).toBe('figma.com');
    expect(resolved.logoSource).toBe('auto');

    const cached = await BrandLogos.findOne({ where: { normalizedName: 'figma' } });
    expect(cached?.domain).toBe('figma.com');
  });

  it('records a negative result (logoSource auto, logoDomain null) when neither cache nor provider matches', async () => {
    // Empty cache + the default MSW handler returns [] → no match anywhere. The
    // worker must still stamp logoSource so the lazy-on-read backfill stops
    // re-enqueuing this subscription on every read.
    const sub = await helpers.createSubscription({
      ...buildBillPayload({ name: `Unbranded Bill ${Date.now()}` }),
      raw: true,
    });

    await until(
      async () => {
        const fetched = await helpers.getSubscriptionById({ id: sub.id, raw: true });
        return fetched.logoSource !== null;
      },
      { timeout: 10_000, interval: 200 },
    );

    const resolved = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    expect(resolved.logoSource).toBe('auto');
    expect(resolved.logoDomain).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Synchronous read-path cache surfacing
//
// A subscription whose normalized name already has a BrandLogos row must surface
// the cached logo on the FIRST read – the GET handler applies cache hits in-band
// before responding, rather than only after the async worker runs a request
// later. This mirrors the payee read-path behavior; the bug being guarded
// against is the read paths diverging (subscriptions returning logoDomain: null
// on first read while payees surfaced it immediately).
// ---------------------------------------------------------------------------

describe('Subscription read-path cache surfacing', () => {
  it('surfaces a cached logo on the first GET /subscriptions/:id (no polling)', async () => {
    await BrandLogos.create({
      normalizedName: 'notion',
      domain: 'notion.so',
      brandName: 'Notion',
      source: 'seed',
    });

    const created = await helpers.createSubscription({ ...buildBillPayload({ name: 'Notion' }), raw: true });

    // First read, no `until`: the in-band cache-apply must have stamped the logo.
    const fetched = await helpers.getSubscriptionById({ id: created.id, raw: true });
    expect(fetched.logoSource).toBe('auto');
    expect(fetched.logoDomain).toBe('notion.so');
  });

  it('surfaces a cached logo on the first GET /subscriptions list (no polling)', async () => {
    await BrandLogos.create({
      normalizedName: 'linear',
      domain: 'linear.app',
      brandName: 'Linear',
      source: 'seed',
    });

    const created = await helpers.createSubscription({ ...buildBillPayload({ name: 'Linear' }), raw: true });

    const list = await helpers.getSubscriptions({ raw: true });
    const item = list.find((s) => s.id === created.id);
    expect(item?.logoSource).toBe('auto');
    expect(item?.logoDomain).toBe('linear.app');
  });
});
