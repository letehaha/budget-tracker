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
const buildBillPayload = (
  overrides: {
    name?: string;
    logoDomain?: string | null;
    logoInitials?: string | null;
    logoColor?: string | null;
    expectedAmount?: number;
    expectedCurrencyCode?: string;
  } = {},
) => ({
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

  it('treats null logoDomain on create as a no-op (resolver keeps ownership)', async () => {
    const created = await helpers.createSubscription({
      ...buildBillPayload({ name: 'Rent', logoDomain: null }),
      raw: true,
    });

    expect(created.logoDomain).toBeNull();
    // Nothing was stored to clear, so no 'manual' stamp – the background
    // resolver stays free to fill this logo in later.
    expect(created.logoSource).not.toBe('manual');
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

// ---------------------------------------------------------------------------
// Custom monogram (logoInitials + logoColor) – the alternative to a brand logo
// ---------------------------------------------------------------------------

describe('Subscription monogram', () => {
  describe('POST /subscriptions', () => {
    it('creates with logoInitials + logoColor and stamps logoSource as manual', async () => {
      const created = await helpers.createSubscription({
        ...buildBillPayload({ name: 'Rent', logoInitials: 'RE', logoColor: '#7355be' }),
        raw: true,
      });

      expect(created.logoInitials).toBe('RE');
      expect(created.logoColor).toBe('#7355be');
      expect(created.logoDomain).toBeNull();
      expect(created.logoSource).toBe('manual');

      const fetched = await helpers.getSubscriptionById({ id: created.id, raw: true });
      expect(fetched.logoInitials).toBe('RE');
      expect(fetched.logoColor).toBe('#7355be');
      expect(fetched.logoDomain).toBeNull();
      expect(fetched.logoSource).toBe('manual');
    });

    it('normalizes logoColor to lowercase', async () => {
      const created = await helpers.createSubscription({
        ...buildBillPayload({ name: 'Upper Hex', logoInitials: 'UH', logoColor: '#7355BE' }),
        raw: true,
      });

      expect(created.logoColor).toBe('#7355be');
    });

    it('accepts two family ZWJ emoji whose UTF-16 length exceeds 16', async () => {
      // Each family emoji is 7 code points (11 UTF-16 units); two of them are 2
      // graphemes / 14 code points, which fits VARCHAR(16) – Postgres counts
      // code points, so a UTF-16-based length cap would wrongly reject this.
      const initials = '👨‍👩‍👧‍👦👨‍👩‍👧‍👦';
      const created = await helpers.createSubscription({
        ...buildBillPayload({ name: 'Two Families', logoInitials: initials }),
        raw: true,
      });

      expect(created.logoInitials).toBe(initials);

      const fetched = await helpers.getSubscriptionById({ id: created.id, raw: true });
      expect(fetched.logoInitials).toBe(initials);
    });

    it('returns 422 when logoDomain and logoInitials are both set', async () => {
      const res = await helpers.createSubscription({
        ...buildBillPayload({ name: 'Both Logos', logoDomain: 'netflix.com', logoInitials: 'NF' }),
        raw: false,
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('returns 422 for whitespace-only logoInitials', async () => {
      const res = await helpers.createSubscription({
        ...buildBillPayload({ name: 'Blank Initials', logoInitials: '   ' }),
        raw: false,
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('returns 422 for three graphemes', async () => {
      const res = await helpers.createSubscription({
        ...buildBillPayload({ name: 'Too Many Letters', logoInitials: 'ABC' }),
        raw: false,
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('returns 422 for a malformed logoColor', async () => {
      const res = await helpers.createSubscription({
        ...buildBillPayload({ name: 'Bad Color', logoInitials: 'BC', logoColor: 'violet' }),
        raw: false,
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('returns 422 when logoColor is sent without logoInitials', async () => {
      const res = await helpers.createSubscription({
        ...buildBillPayload({ name: 'Color Only', logoColor: '#7355be' }),
        raw: false,
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });

  describe('PUT /subscriptions/:id', () => {
    it('sets a monogram and clears an existing logoDomain', async () => {
      const sub = await helpers.createSubscription({
        ...buildBillPayload({ name: 'Corner Gym', logoDomain: 'gym.example' }),
        raw: true,
      });

      const updated = await helpers.updateSubscription({
        id: sub.id,
        logoInitials: 'CG',
        logoColor: '#22c55e',
        raw: true,
      });

      expect(updated.logoInitials).toBe('CG');
      expect(updated.logoColor).toBe('#22c55e');
      expect(updated.logoDomain).toBeNull();
      expect(updated.logoSource).toBe('manual');
    });

    it('clears the monogram when a brand domain is picked', async () => {
      const sub = await helpers.createSubscription({
        ...buildBillPayload({ name: 'Switcheroo', logoInitials: 'SW', logoColor: '#ef4444' }),
        raw: true,
      });

      const updated = await helpers.updateSubscription({ id: sub.id, logoDomain: 'netflix.com', raw: true });

      expect(updated.logoDomain).toBe('netflix.com');
      expect(updated.logoInitials).toBeNull();
      expect(updated.logoColor).toBeNull();
      expect(updated.logoSource).toBe('manual');
    });

    it('clears initials and color when logoInitials is null, keeping logoSource manual', async () => {
      const sub = await helpers.createSubscription({
        ...buildBillPayload({ name: 'Clear Me', logoInitials: 'CM', logoColor: '#ef4444' }),
        raw: true,
      });

      const updated = await helpers.updateSubscription({ id: sub.id, logoInitials: null, raw: true });

      expect(updated.logoInitials).toBeNull();
      expect(updated.logoColor).toBeNull();
      expect(updated.logoSource).toBe('manual');
    });

    it('keeps the monogram when logoDomain is explicitly cleared', async () => {
      // Domain and initials are asymmetric on purpose: setting a domain evicts
      // the monogram, but clearing the (already null) domain must not touch it.
      const sub = await helpers.createSubscription({
        ...buildBillPayload({ name: 'Mono Survives', logoInitials: 'MS', logoColor: '#7355be' }),
        raw: true,
      });

      const updated = await helpers.updateSubscription({ id: sub.id, logoDomain: null, raw: true });

      expect(updated.logoDomain).toBeNull();
      expect(updated.logoInitials).toBe('MS');
      expect(updated.logoColor).toBe('#7355be');
    });

    it('updates logoColor alone when the subscription already has initials', async () => {
      const sub = await helpers.createSubscription({
        ...buildBillPayload({ name: 'Recolor', logoInitials: 'RC', logoColor: '#7355be' }),
        raw: true,
      });

      const updated = await helpers.updateSubscription({ id: sub.id, logoColor: '#0ea5e9', raw: true });

      expect(updated.logoColor).toBe('#0ea5e9');
      expect(updated.logoInitials).toBe('RC');
    });

    it('leaves the monogram untouched when the payload omits the logo keys', async () => {
      const sub = await helpers.createSubscription({
        ...buildBillPayload({ name: 'Keep Mono', logoInitials: 'KM', logoColor: '#7355be' }),
        raw: true,
      });

      const updated = await helpers.updateSubscription({ id: sub.id, name: 'Keep Mono Renamed', raw: true });

      expect(updated.logoInitials).toBe('KM');
      expect(updated.logoColor).toBe('#7355be');
      expect(updated.logoSource).toBe('manual');
    });

    it('returns 422 when logoColor is sent for a subscription without initials', async () => {
      const sub = await helpers.createSubscription({ ...buildBillPayload({ name: 'No Initials Yet' }), raw: true });

      const res = await helpers.updateSubscription({ id: sub.id, logoColor: '#7355be', raw: false });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('returns 422 when the payload carries both logoDomain and logoInitials', async () => {
      const sub = await helpers.createSubscription({ ...buildBillPayload({ name: 'Both On Update' }), raw: true });

      const res = await helpers.updateSubscription({
        id: sub.id,
        logoDomain: 'netflix.com',
        logoInitials: 'NF',
        raw: false,
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });

  describe('read paths', () => {
    it('returns the monogram fields on GET /subscriptions', async () => {
      const created = await helpers.createSubscription({
        ...buildBillPayload({ name: 'Listed Mono', logoInitials: 'LM', logoColor: '#7355be' }),
        raw: true,
      });

      const list = await helpers.getSubscriptions({ raw: true });
      const item = list.find((s) => s.id === created.id);

      expect(item?.logoInitials).toBe('LM');
      expect(item?.logoColor).toBe('#7355be');
    });

    it('returns the monogram fields on GET /subscriptions/upcoming', async () => {
      const created = await helpers.createSubscription({
        ...buildBillPayload({
          name: 'Upcoming Mono',
          logoInitials: 'UM',
          logoColor: '#7355be',
          expectedAmount: 12.5,
          expectedCurrencyCode: global.BASE_CURRENCY_CODE,
        }),
        raw: true,
      });

      const upcoming = await helpers.getUpcomingPayments({ raw: true });
      const item = upcoming.find((payment) => payment.subscriptionId === created.id);

      expect(item?.logoInitials).toBe('UM');
      expect(item?.logoColor).toBe('#7355be');
    });
  });

  describe('POST /subscriptions/:id/reset-logo', () => {
    it('clears initials and color and lets auto-resolution re-run', async () => {
      await BrandLogos.create({
        normalizedName: 'twilio',
        domain: 'twilio.com',
        brandName: 'Twilio',
        source: 'seed',
      });

      const sub = await helpers.createSubscription({
        ...buildBillPayload({ name: 'Twilio', logoInitials: 'TW', logoColor: '#7355be' }),
        raw: true,
      });
      expect(sub.logoSource).toBe('manual');

      const reset = await helpers.resetSubscriptionLogo({ id: sub.id, raw: true });
      expect(reset.logoInitials).toBeNull();
      expect(reset.logoColor).toBeNull();
      expect(reset.logoDomain).toBeNull();
      expect(reset.logoSource).toBeNull();

      await until(
        async () => {
          const fetched = await helpers.getSubscriptionById({ id: sub.id, raw: true });
          return fetched.logoSource === 'auto';
        },
        { timeout: 10_000, interval: 200 },
      );

      const reResolved = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      expect(reResolved.logoDomain).toBe('twilio.com');
      expect(reResolved.logoInitials).toBeNull();
    });
  });
});
