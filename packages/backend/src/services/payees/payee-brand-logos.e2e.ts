import { until } from '@common/helpers';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import BrandLogos from '@models/brand-logos.model';
import * as helpers from '@tests/helpers';
import { getLogoDevSearchMock } from '@tests/mocks/logo-dev/mock-api';

// ---------------------------------------------------------------------------
// GET /api/payees/logo-search?q=...
// ---------------------------------------------------------------------------

describe('Payee brand-logo search', () => {
  describe('GET /payees/logo-search', () => {
    it('returns matching results when the provider returns brands', async () => {
      global.mswMockServer.use(
        getLogoDevSearchMock({
          results: [
            { name: 'Amazon', domain: 'amazon.com', logoUrl: 'https://img.logo.dev/amazon.com' },
            { name: 'Amazon Web Services', domain: 'aws.amazon.com', logoUrl: 'https://img.logo.dev/aws.amazon.com' },
          ],
        }),
      );

      const data = await helpers.searchPayeeLogos({ q: 'amazon', raw: true });

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
      // Default MSW handler already returns [] — no override needed.
      const data = await helpers.searchPayeeLogos({ q: 'xyznonexistentbrand', raw: true });

      expect(data.results).toEqual([]);
    });

    it('returns empty results when q is absent', async () => {
      // The controller short-circuits before calling searchBrands when q is empty / missing.
      const data = await helpers.searchPayeeLogos({ raw: true });

      expect(data.results).toEqual([]);
    });

    it('returns empty results when q is an empty string', async () => {
      const data = await helpers.searchPayeeLogos({ q: '', raw: true });

      expect(data.results).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/payees  — logoDomain field (manual logo at creation time)
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

    it('auto-resolves from the BrandLogos cache when logoDomain is omitted', async () => {
      // Seed the shared cache so the post-commit worker hits it (no logo.dev call).
      await BrandLogos.create({
        normalizedName: 'gitlab',
        domain: 'gitlab.com',
        brandName: 'GitLab',
        source: 'seed',
      });

      const created = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'GitLab' }),
        raw: true,
      });

      await until(
        async () => {
          const fetched = await helpers.getPayeeById({ id: created.id, raw: true });
          return fetched.logoSource !== null;
        },
        { timeout: 10_000, interval: 200 },
      );

      const resolved = await helpers.getPayeeById({ id: created.id, raw: true });
      expect(resolved.logoSource).toBe('auto');
      expect(resolved.logoDomain).toBe('gitlab.com');
    });

    it('keeps a manual logoDomain even when a matching BrandLogos cache entry exists', async () => {
      // A cache entry that WOULD be picked up by auto-resolution — the manual
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

    it('returns 422 when logoDomain contains a space', async () => {
      const res = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Create Bad Domain Space', logoDomain: 'has space' }),
        raw: false,
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('returns 422 when logoDomain contains a slash', async () => {
      const res = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Create Bad Domain Slash', logoDomain: 'x/y' }),
        raw: false,
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/payees/:id  — logoDomain field
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

    it('accepts null logoDomain and stamps logoSource as manual (explicit no-logo)', async () => {
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
      expect(updated.logoSource).toBe('manual');
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

      // Update a different field — logo fields must remain unchanged.
      const updated = await helpers.updatePayee({
        id: payee.id,
        payload: { name: 'Spotify Premium' },
        raw: true,
      });

      expect(updated.logoDomain).toBe('spotify.com');
      expect(updated.logoSource).toBe('manual');
    });

    it('returns 422 when logoDomain contains a space', async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Bad Domain Test' }),
        raw: true,
      });

      const res = await helpers.updatePayee({
        id: payee.id,
        payload: { logoDomain: 'ht tp://x' },
        raw: false,
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('returns 422 when logoDomain contains a slash', async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Bad Domain Test 2' }),
        raw: true,
      });

      const res = await helpers.updatePayee({
        id: payee.id,
        payload: { logoDomain: 'example.com/path' },
        raw: false,
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
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

    it('is idempotent — resetting a payee that already has no logo succeeds', async () => {
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
// the Sequelize model — allowed here because this is background-data seeding,
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
