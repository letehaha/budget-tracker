import { until } from '@common/helpers';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import BrandLogos from '@models/brand-logos.model';
import * as helpers from '@tests/helpers';
import { getLogoDevSearchMock } from '@tests/mocks/logo-dev/mock-api';

// ---------------------------------------------------------------------------
// GET /api/brand-logos/search?q=...  – shared brand-logo search backing the
// payee + subscription logo pickers. Kept first: these tests must run before
// any payee exists, so an in-flight logo-resolution job can't observe the
// per-test MSW override below.
// ---------------------------------------------------------------------------

describe('Brand-logo search', () => {
  describe('GET /brand-logos/search', () => {
    it('returns matching results when the provider returns brands', async () => {
      global.mswMockServer.use(
        getLogoDevSearchMock({
          results: [
            { name: 'Amazon', domain: 'amazon.com', logoUrl: 'https://img.logo.dev/amazon.com' },
            { name: 'Amazon Web Services', domain: 'aws.amazon.com', logoUrl: 'https://img.logo.dev/aws.amazon.com' },
          ],
        }),
      );

      const data = await helpers.searchBrandLogos({ q: 'amazon', raw: true });

      expect(data.results).toHaveLength(2);
      expect(data.results[0]).toMatchObject({
        name: 'Amazon',
        domain: 'amazon.com',
        logoUrl: 'https://img.logo.dev/amazon.com',
      });
      expect(data.results[1]).toMatchObject({
        name: 'Amazon Web Services',
        domain: 'aws.amazon.com',
      });
    });

    it('returns empty results when the provider returns nothing', async () => {
      // Default MSW handler already returns [] – no override needed.
      const data = await helpers.searchBrandLogos({ q: 'xyznonexistentbrand', raw: true });

      expect(data.results).toEqual([]);
    });

    it('returns empty results when q is absent', async () => {
      // The controller short-circuits before calling searchBrands when q is empty / missing.
      const data = await helpers.searchBrandLogos({ raw: true });

      expect(data.results).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/payees  – logoDomain field (manual logo at creation time)
// ---------------------------------------------------------------------------

describe('Payee POST logoDomain', () => {
  describe('POST /payees', () => {
    it('creates with logoDomain and stamps logoSource as manual', async () => {
      const created = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Netflix', logoDomain: 'netflix.com' }),
        raw: true,
      });

      const fetched = await helpers.getPayeeById({ id: created.id, raw: true });
      expect(fetched.logoDomain).toBe('netflix.com');
      expect(fetched.logoSource).toBe('manual');
    });

    it('keeps a manual logoDomain even when a matching BrandLogos cache entry exists', async () => {
      // A cache entry that WOULD be picked up by auto-resolution – the manual
      // override must win because the resolver bails on logoSource = 'manual'.
      await BrandLogos.create({
        normalizedName: 'dropbox',
        domain: 'dropbox.com',
        brandName: 'Dropbox',
        source: 'seed',
      });

      const created = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Dropbox', logoDomain: 'custom.example' }),
        raw: true,
      });

      // Give the post-commit worker a window to (wrongly) clobber the manual
      // choice; the guard must keep it intact.
      await until(
        async () => {
          const fetched = await helpers.getPayeeById({ id: created.id, raw: true });
          return fetched.logoSource === 'manual' && fetched.logoDomain === 'custom.example';
        },
        { timeout: 3_000, interval: 200 },
      );

      const after = await helpers.getPayeeById({ id: created.id, raw: true });
      expect(after.logoSource).toBe('manual');
      expect(after.logoDomain).toBe('custom.example');
    });
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/payees/:id  – logoDomain field
// ---------------------------------------------------------------------------

describe('Payee PATCH logoDomain', () => {
  describe('PATCH /payees/:id', () => {
    it('sets logoDomain and stamps logoSource as manual', async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Netflix' }),
        raw: true,
      });

      const updated = await helpers.updatePayee({
        id: payee.id,
        payload: { logoDomain: 'netflix.com' },
        raw: true,
      });

      expect(updated.logoDomain).toBe('netflix.com');
      expect(updated.logoSource).toBe('manual');
    });

    it('treats null logoDomain as a no-op when no logo is stored (resolver keeps ownership)', async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Netflix' }),
        raw: true,
      });

      const updated = await helpers.updatePayee({
        id: payee.id,
        payload: { logoDomain: null },
        raw: true,
      });

      expect(updated.logoDomain).toBeNull();
      // Nothing stored changed, so no 'manual' stamp – the background resolver
      // stays free to fill this logo in later. (logoSource may already be
      // 'auto' here if the create-time resolution negative-resolved first.)
      expect(updated.logoSource).not.toBe('manual');
    });

    it('leaves logo fields untouched when logoDomain is not included in the payload', async () => {
      // Pre-set a logo so there is something to check against.
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Spotify' }),
        raw: true,
      });
      await helpers.updatePayee({
        id: payee.id,
        payload: { logoDomain: 'spotify.com' },
        raw: true,
      });

      // Update a different field – logo fields must remain unchanged.
      const updated = await helpers.updatePayee({
        id: payee.id,
        payload: { name: 'Spotify Premium' },
        raw: true,
      });

      expect(updated.logoDomain).toBe('spotify.com');
      expect(updated.logoSource).toBe('manual');
    });

    it('returns 404 for a payee that does not exist', async () => {
      const res = await helpers.updatePayee({
        id: generateRandomRecordId(),
        payload: { logoDomain: 'example.com' },
        raw: false,
      });

      expect(res.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it("returns 404 when a different user tries to set another user's logoDomain", async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'LogoCrossUserGuard' }),
        raw: true,
      });

      const handle = await helpers.signUpSecondUser();
      const response = await helpers.asUser({
        cookies: handle.cookies,
        fn: () =>
          helpers.updatePayee({
            id: payee.id,
            payload: { logoDomain: 'hijack.com' },
            raw: false,
          }),
      });
      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);

      // The foreign PATCH is blocked: the hijack domain is never applied and no
      // 'manual' stamp slips through. (logoSource may be 'auto' here if the
      // background resolver negative-resolved this Payee in the meantime.)
      const after = await helpers.getPayeeById({ id: payee.id, raw: true });
      expect(after.logoDomain).toBeNull();
      expect(after.logoSource).not.toBe('manual');
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/payees/:id/reset-logo
// ---------------------------------------------------------------------------

describe('Payee reset-logo', () => {
  describe('POST /payees/:id/reset-logo', () => {
    it('clears logoDomain and logoSource back to null', async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Apple' }),
        raw: true,
      });
      await helpers.updatePayee({
        id: payee.id,
        payload: { logoDomain: 'apple.com' },
        raw: true,
      });

      const reset = await helpers.resetPayeeLogo({ id: payee.id, raw: true });

      expect(reset.logoDomain).toBeNull();
      expect(reset.logoSource).toBeNull();
    });

    it('is idempotent – resetting a payee that already has no logo succeeds', async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'No Logo Co' }),
        raw: true,
      });

      const reset = await helpers.resetPayeeLogo({ id: payee.id, raw: true });

      expect(reset.logoDomain).toBeNull();
      expect(reset.logoSource).toBeNull();
    });

    it('returns 404 for a payee that does not exist', async () => {
      const res = await helpers.resetPayeeLogo({ id: generateRandomRecordId(), raw: false });

      expect(res.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it("returns 404 when a different user tries to reset another user's logo", async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'ResetCrossUserGuard' }),
        raw: true,
      });
      await helpers.updatePayee({ id: payee.id, payload: { logoDomain: 'owned.com' }, raw: true });

      const handle = await helpers.signUpSecondUser();
      const response = await helpers.asUser({
        cookies: handle.cookies,
        fn: () => helpers.resetPayeeLogo({ id: payee.id, raw: false }),
      });
      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);

      // The owner's manual logo survives the foreign reset attempt.
      const after = await helpers.getPayeeById({ id: payee.id, raw: true });
      expect(after.logoDomain).toBe('owned.com');
      expect(after.logoSource).toBe('manual');
    });
  });
});

// ---------------------------------------------------------------------------
// Auto-resolution via BullMQ queue (cache hit path)
//
// The logo-resolution worker is running in the test environment (started by
// setupIntegrationTests). We seed the shared BrandLogos cache directly (via
// the Sequelize model – allowed here because this is background-data seeding,
// not the endpoint under test). When a new Payee is created its name matches
// a BrandLogos row, the worker picks it up and writes logoDomain + 'auto'.
// We poll GET /payees/:id until logoDomain is populated.
// ---------------------------------------------------------------------------

describe('Payee logo auto-resolution', () => {
  it('resolves logoDomain automatically from the BrandLogos cache after payee creation', async () => {
    // Seed the shared cache so the worker hits it without any logo.dev call.
    await BrandLogos.create({
      normalizedName: 'github',
      domain: 'github.com',
      brandName: 'GitHub',
      source: 'seed',
    });

    const payee = await helpers.createPayee({
      payload: helpers.buildPayeePayload({ name: 'GitHub' }),
      raw: true,
    });

    // Poll GET /payees/:id until the worker stamps the logo fields.
    await until(
      async () => {
        const fetched = await helpers.getPayeeById({ id: payee.id, raw: true });
        return fetched.logoDomain !== null && fetched.logoSource !== null;
      },
      { timeout: 10_000, interval: 200 },
    );

    const resolved = await helpers.getPayeeById({ id: payee.id, raw: true });
    expect(resolved.logoDomain).toBe('github.com');
    expect(resolved.logoSource).toBe('auto');
  });

  it('resolves from the logo.dev provider and writes the result back to the cache on a cache miss', async () => {
    // No BrandLogos seed → the worker falls through to the provider, then
    // persists the winning result so the next Payee with this name skips the API.
    global.mswMockServer.use(
      getLogoDevSearchMock({
        results: [{ name: 'Figma', domain: 'figma.com', logoUrl: 'https://img.logo.dev/figma.com' }],
      }),
    );

    const payee = await helpers.createPayee({
      payload: helpers.buildPayeePayload({ name: 'Figma' }),
      raw: true,
    });

    await until(
      async () => {
        const fetched = await helpers.getPayeeById({ id: payee.id, raw: true });
        return fetched.logoSource !== null;
      },
      { timeout: 10_000, interval: 200 },
    );

    const resolved = await helpers.getPayeeById({ id: payee.id, raw: true });
    expect(resolved.logoDomain).toBe('figma.com');
    expect(resolved.logoSource).toBe('auto');

    const cached = await BrandLogos.findOne({ where: { normalizedName: 'figma' } });
    expect(cached).not.toBeNull();
    expect(cached?.domain).toBe('figma.com');
    expect(cached?.source).toBe('logodev');
  });

  it('clamps an over-long provider brand name to the cache column width', async () => {
    global.mswMockServer.use(
      getLogoDevSearchMock({
        results: [{ name: 'L'.repeat(300), domain: 'longbrand.com', logoUrl: null }],
      }),
    );

    const payee = await helpers.createPayee({
      payload: helpers.buildPayeePayload({ name: 'Longbrand Co' }),
      raw: true,
    });

    await until(
      async () => {
        const fetched = await helpers.getPayeeById({ id: payee.id, raw: true });
        return fetched.logoSource !== null;
      },
      { timeout: 10_000, interval: 200 },
    );

    const cached = await BrandLogos.findOne({ where: { normalizedName: 'longbrand co' } });
    expect(cached?.brandName).toHaveLength(200);
    expect(cached?.domain).toBe('longbrand.com');
  });

  it('records a negative result (logoSource auto, logoDomain null) when neither cache nor provider matches', async () => {
    // Empty cache + the default MSW handler returns [] → no match anywhere. The
    // worker must still stamp logoSource so the lazy-on-read backfill stops
    // re-enqueuing this Payee on every list/detail request.
    const payee = await helpers.createPayee({
      payload: helpers.buildPayeePayload({ name: `Unbranded Co ${Date.now()}` }),
      raw: true,
    });

    await until(
      async () => {
        const fetched = await helpers.getPayeeById({ id: payee.id, raw: true });
        return fetched.logoSource !== null;
      },
      { timeout: 10_000, interval: 200 },
    );

    const resolved = await helpers.getPayeeById({ id: payee.id, raw: true });
    expect(resolved.logoSource).toBe('auto');
    expect(resolved.logoDomain).toBeNull();
  });

  it('re-resolves automatically after a manual logo is reset', async () => {
    // A cache entry the resolver picks up once the manual override is cleared.
    await BrandLogos.create({
      normalizedName: 'slack',
      domain: 'slack.com',
      brandName: 'Slack',
      source: 'seed',
    });

    const payee = await helpers.createPayee({
      payload: helpers.buildPayeePayload({ name: 'Slack' }),
      raw: true,
    });

    // Let the create-time auto-resolution settle so the manual override below
    // can't race the worker's first pass.
    await until(
      async () => {
        const fetched = await helpers.getPayeeById({ id: payee.id, raw: true });
        return fetched.logoSource !== null;
      },
      { timeout: 10_000, interval: 200 },
    );

    // User overrides with their own domain (logoSource → manual).
    const manual = await helpers.updatePayee({
      id: payee.id,
      payload: { logoDomain: 'custom.example' },
      raw: true,
    });
    expect(manual.logoSource).toBe('manual');

    // Reset clears the override and enqueues a fresh resolution after the
    // transaction commits, so the worker sees the committed null logoSource
    // (not the stale 'manual') and re-resolves from the cache.
    const reset = await helpers.resetPayeeLogo({ id: payee.id, raw: true });
    expect(reset.logoSource).toBeNull();
    expect(reset.logoDomain).toBeNull();

    await until(
      async () => {
        const fetched = await helpers.getPayeeById({ id: payee.id, raw: true });
        return fetched.logoSource === 'auto';
      },
      { timeout: 10_000, interval: 200 },
    );

    const reResolved = await helpers.getPayeeById({ id: payee.id, raw: true });
    expect(reResolved.logoSource).toBe('auto');
    expect(reResolved.logoDomain).toBe('slack.com');
  });
});

// ---------------------------------------------------------------------------
// Custom monogram (logoInitials + logoColor) – the alternative to a brand logo
// ---------------------------------------------------------------------------

describe('Payee monogram', () => {
  describe('POST /payees', () => {
    it('creates with logoInitials + logoColor and stamps logoSource as manual', async () => {
      const created = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Local Bakery', logoInitials: 'LB', logoColor: '#7355be' }),
        raw: true,
      });

      expect(created.logoInitials).toBe('LB');
      expect(created.logoColor).toBe('#7355be');
      expect(created.logoDomain).toBeNull();
      expect(created.logoSource).toBe('manual');

      const fetched = await helpers.getPayeeById({ id: created.id, raw: true });
      expect(fetched.logoInitials).toBe('LB');
      expect(fetched.logoColor).toBe('#7355be');
      expect(fetched.logoDomain).toBeNull();
      expect(fetched.logoSource).toBe('manual');
    });

    it('normalizes logoColor to lowercase', async () => {
      const created = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Upper Hex', logoInitials: 'UH', logoColor: '#7355BE' }),
        raw: true,
      });

      expect(created.logoColor).toBe('#7355be');
    });

    it('accepts a single ZWJ emoji as one grapheme', async () => {
      const created = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Family Fund', logoInitials: '👨‍👩‍👧' }),
        raw: true,
      });

      expect(created.logoInitials).toBe('👨‍👩‍👧');
      expect(created.logoColor).toBeNull();
    });

    it('accepts two family ZWJ emoji whose UTF-16 length exceeds 16', async () => {
      // Each family emoji is 7 code points (11 UTF-16 units); two of them are 2
      // graphemes / 14 code points, which fits VARCHAR(16) – Postgres counts
      // code points, so a UTF-16-based length cap would wrongly reject this.
      const initials = '👨‍👩‍👧‍👦👨‍👩‍👧‍👦';
      const created = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Two Families', logoInitials: initials }),
        raw: true,
      });

      expect(created.logoInitials).toBe(initials);

      const fetched = await helpers.getPayeeById({ id: created.id, raw: true });
      expect(fetched.logoInitials).toBe(initials);
    });

    it('keeps the monogram even when a matching BrandLogos cache entry exists', async () => {
      // A cache entry the resolver WOULD pick up – the manual stamp must win.
      await BrandLogos.create({
        normalizedName: 'dropbox',
        domain: 'dropbox.com',
        brandName: 'Dropbox',
        source: 'seed',
      });

      const created = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Dropbox', logoInitials: 'DB' }),
        raw: true,
      });

      // Give the post-commit worker a window to (wrongly) clobber the monogram.
      await until(
        async () => {
          const fetched = await helpers.getPayeeById({ id: created.id, raw: true });
          return fetched.logoSource === 'manual' && fetched.logoInitials === 'DB';
        },
        { timeout: 3_000, interval: 200 },
      );

      const after = await helpers.getPayeeById({ id: created.id, raw: true });
      expect(after.logoInitials).toBe('DB');
      expect(after.logoDomain).toBeNull();
    });

    it('returns 422 when logoDomain and logoInitials are both set', async () => {
      const res = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Both Logos', logoDomain: 'netflix.com', logoInitials: 'NF' }),
        raw: false,
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });

  describe('PATCH /payees/:id', () => {
    it('sets a monogram and clears an existing logoDomain', async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Corner Shop', logoDomain: 'shop.example' }),
        raw: true,
      });

      const updated = await helpers.updatePayee({
        id: payee.id,
        payload: { logoInitials: 'CS', logoColor: '#22c55e' },
        raw: true,
      });

      expect(updated.logoInitials).toBe('CS');
      expect(updated.logoColor).toBe('#22c55e');
      expect(updated.logoDomain).toBeNull();
      expect(updated.logoSource).toBe('manual');
    });

    it('clears the monogram when a brand domain is picked', async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Switcheroo', logoInitials: 'SW', logoColor: '#ef4444' }),
        raw: true,
      });

      const updated = await helpers.updatePayee({
        id: payee.id,
        payload: { logoDomain: 'netflix.com' },
        raw: true,
      });

      expect(updated.logoDomain).toBe('netflix.com');
      expect(updated.logoInitials).toBeNull();
      expect(updated.logoColor).toBeNull();
      expect(updated.logoSource).toBe('manual');
    });

    it('clears initials and color when logoInitials is null, keeping logoSource manual', async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Clear Me', logoInitials: 'CM', logoColor: '#ef4444' }),
        raw: true,
      });

      const updated = await helpers.updatePayee({
        id: payee.id,
        payload: { logoInitials: null },
        raw: true,
      });

      expect(updated.logoInitials).toBeNull();
      expect(updated.logoColor).toBeNull();
      expect(updated.logoSource).toBe('manual');
    });

    it('keeps the monogram when logoDomain is explicitly cleared', async () => {
      // Domain and initials are asymmetric on purpose: setting a domain evicts
      // the monogram, but clearing the (already null) domain must not touch it.
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Mono Survives', logoInitials: 'MS', logoColor: '#7355be' }),
        raw: true,
      });

      const updated = await helpers.updatePayee({
        id: payee.id,
        payload: { logoDomain: null },
        raw: true,
      });

      expect(updated.logoDomain).toBeNull();
      expect(updated.logoInitials).toBe('MS');
      expect(updated.logoColor).toBe('#7355be');
    });

    it('updates logoColor alone when the payee already has initials', async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Recolor', logoInitials: 'RC', logoColor: '#7355be' }),
        raw: true,
      });

      const updated = await helpers.updatePayee({
        id: payee.id,
        payload: { logoColor: '#0ea5e9' },
        raw: true,
      });

      expect(updated.logoColor).toBe('#0ea5e9');
      expect(updated.logoInitials).toBe('RC');
    });

    it('leaves the monogram untouched when the payload omits the logo keys', async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Keep Mono', logoInitials: 'KM', logoColor: '#7355be' }),
        raw: true,
      });

      const updated = await helpers.updatePayee({
        id: payee.id,
        payload: { name: 'Keep Mono Renamed' },
        raw: true,
      });

      expect(updated.logoInitials).toBe('KM');
      expect(updated.logoColor).toBe('#7355be');
      expect(updated.logoSource).toBe('manual');
    });

    it('returns 422 when the payload carries both logoDomain and logoInitials', async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Both On Update' }),
        raw: true,
      });

      const res = await helpers.updatePayee({
        id: payee.id,
        payload: { logoDomain: 'netflix.com', logoInitials: 'NF' },
        raw: false,
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });

  describe('POST /payees/:id/reset-logo', () => {
    it('clears initials and color and lets auto-resolution re-run', async () => {
      await BrandLogos.create({
        normalizedName: 'twilio',
        domain: 'twilio.com',
        brandName: 'Twilio',
        source: 'seed',
      });

      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Twilio', logoInitials: 'TW', logoColor: '#7355be' }),
        raw: true,
      });
      expect(payee.logoSource).toBe('manual');

      const reset = await helpers.resetPayeeLogo({ id: payee.id, raw: true });
      expect(reset.logoInitials).toBeNull();
      expect(reset.logoColor).toBeNull();
      expect(reset.logoDomain).toBeNull();
      expect(reset.logoSource).toBeNull();

      await until(
        async () => {
          const fetched = await helpers.getPayeeById({ id: payee.id, raw: true });
          return fetched.logoSource === 'auto';
        },
        { timeout: 10_000, interval: 200 },
      );

      const reResolved = await helpers.getPayeeById({ id: payee.id, raw: true });
      expect(reResolved.logoDomain).toBe('twilio.com');
      expect(reResolved.logoInitials).toBeNull();
    });
  });
});
