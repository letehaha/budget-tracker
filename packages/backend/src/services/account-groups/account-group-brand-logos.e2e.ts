import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import BrandLogos from '@models/brand-logos.model';
import * as helpers from '@tests/helpers';

async function findGroupInList({ id }: { id: string }) {
  const groups = await helpers.getAccountGroups({ raw: true });
  return groups.find((group) => group.id === id);
}

// ---------------------------------------------------------------------------
// POST /api/account-group – logo fields at creation time
//
// Groups have no logo resolution: their generic folder names ("Cash", "Family")
// would make brand search assign wrong logos. Every logo a group carries was
// picked by the user, so there is no logoSource column to record an origin.
// ---------------------------------------------------------------------------

describe('AccountGroup POST logo', () => {
  describe('POST /account-group', () => {
    it('creates with a logoDomain', async () => {
      const created = await helpers.createAccountGroup({
        name: 'Family',
        logoDomain: 'family.example',
        raw: true,
      });

      expect(created.logoDomain).toBe('family.example');
      expect(created.logoInitials).toBeNull();
      expect(created.logoColor).toBeNull();
      expect(created).not.toHaveProperty('logoSource');
    });

    it('creates with logoInitials and logoColor', async () => {
      const created = await helpers.createAccountGroup({
        name: 'Cash',
        logoInitials: 'CA',
        logoColor: '#7355be',
        raw: true,
      });

      expect(created.logoInitials).toBe('CA');
      expect(created.logoColor).toBe('#7355be');
      expect(created.logoDomain).toBeNull();
      expect(created).not.toHaveProperty('logoSource');
    });

    it('normalizes logoColor to lowercase', async () => {
      const created = await helpers.createAccountGroup({
        name: 'Upper Hex',
        logoInitials: 'UH',
        logoColor: '#7355BE',
        raw: true,
      });

      expect(created.logoColor).toBe('#7355be');
    });

    it('never resolves a group logo, even with a matching BrandLogos cache entry', async () => {
      // A cache entry that WOULD be picked up if groups had logo resolution.
      await BrandLogos.create({
        normalizedName: 'notion',
        domain: 'notion.so',
        brandName: 'Notion',
        source: 'seed',
      });

      const created = await helpers.createAccountGroup({ name: 'Notion', raw: true });
      expect(created.logoDomain).toBeNull();

      const found = await findGroupInList({ id: created.id });
      expect(found?.logoDomain).toBeNull();
      expect(found?.logoInitials).toBeNull();
      expect(found?.logoColor).toBeNull();
    });

    it('returns 422 when logoDomain and logoInitials are both set', async () => {
      const res = await helpers.createAccountGroup({
        name: 'Both Logos',
        logoDomain: 'netflix.com',
        logoInitials: 'NF',
        raw: false,
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('returns 422 when logoDomain contains a space', async () => {
      const res = await helpers.createAccountGroup({
        name: 'Bad Domain Space',
        logoDomain: 'has space',
        raw: false,
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('returns 422 for a malformed logoColor', async () => {
      const res = await helpers.createAccountGroup({
        name: 'Bad Color',
        logoInitials: 'BC',
        logoColor: 'violet',
        raw: false,
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('returns 422 when logoColor is sent without logoInitials', async () => {
      const res = await helpers.createAccountGroup({
        name: 'Color Only',
        logoColor: '#7355be',
        raw: false,
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });
});

// ---------------------------------------------------------------------------
// PUT /api/account-group/:groupId – logo fields
//
// The response body is a single-element array whose first item is the updated
// group. Null logo fields are the reset: they leave the group indistinguishable
// from one that never had a logo.
// ---------------------------------------------------------------------------

describe('AccountGroup PUT logo', () => {
  describe('PUT /account-group/:groupId', () => {
    it('sets a logoDomain', async () => {
      const group = await helpers.createAccountGroup({ name: 'Banking', raw: true });

      const [updated] = await helpers.updateAccountGroup({
        groupId: group.id,
        logoDomain: 'bank.example',
        raw: true,
      });

      expect(updated?.logoDomain).toBe('bank.example');
      expect(updated).not.toHaveProperty('logoSource');
    });

    it('sets a monogram and clears an existing logoDomain', async () => {
      const group = await helpers.createAccountGroup({
        name: 'Savings',
        logoDomain: 'savings.example',
        raw: true,
      });

      const [updated] = await helpers.updateAccountGroup({
        groupId: group.id,
        logoInitials: 'SA',
        logoColor: '#22c55e',
        raw: true,
      });

      expect(updated?.logoInitials).toBe('SA');
      expect(updated?.logoColor).toBe('#22c55e');
      expect(updated?.logoDomain).toBeNull();
    });

    it('clears the monogram when a brand domain is picked', async () => {
      const group = await helpers.createAccountGroup({
        name: 'Switcheroo',
        logoInitials: 'SW',
        logoColor: '#ef4444',
        raw: true,
      });

      const [updated] = await helpers.updateAccountGroup({
        groupId: group.id,
        logoDomain: 'netflix.com',
        raw: true,
      });

      expect(updated?.logoDomain).toBe('netflix.com');
      expect(updated?.logoInitials).toBeNull();
      expect(updated?.logoColor).toBeNull();
    });

    it('clears initials and color when logoInitials is null', async () => {
      const group = await helpers.createAccountGroup({
        name: 'Clear Me',
        logoInitials: 'CM',
        logoColor: '#ef4444',
        raw: true,
      });

      const [updated] = await helpers.updateAccountGroup({
        groupId: group.id,
        logoInitials: null,
        raw: true,
      });

      expect(updated?.logoInitials).toBeNull();
      expect(updated?.logoColor).toBeNull();
    });

    it('keeps the monogram when logoDomain is explicitly cleared', async () => {
      // Domain and initials are asymmetric on purpose: setting a domain evicts
      // the monogram, but clearing the (already null) domain must not touch it.
      const group = await helpers.createAccountGroup({
        name: 'Mono Survives',
        logoInitials: 'MS',
        logoColor: '#7355be',
        raw: true,
      });

      const [updated] = await helpers.updateAccountGroup({
        groupId: group.id,
        logoDomain: null,
        raw: true,
      });

      expect(updated?.logoDomain).toBeNull();
      expect(updated?.logoInitials).toBe('MS');
      expect(updated?.logoColor).toBe('#7355be');
    });

    it('updates logoColor alone when the group already has initials', async () => {
      const group = await helpers.createAccountGroup({
        name: 'Recolor',
        logoInitials: 'RC',
        logoColor: '#7355be',
        raw: true,
      });

      const [updated] = await helpers.updateAccountGroup({
        groupId: group.id,
        logoColor: '#0ea5e9',
        raw: true,
      });

      expect(updated?.logoColor).toBe('#0ea5e9');
      expect(updated?.logoInitials).toBe('RC');
    });

    it('leaves the logo untouched when the payload omits the logo keys', async () => {
      const group = await helpers.createAccountGroup({
        name: 'Keep Mono',
        logoInitials: 'KM',
        logoColor: '#7355be',
        raw: true,
      });

      const [updated] = await helpers.updateAccountGroup({
        groupId: group.id,
        name: 'Keep Mono Renamed',
        raw: true,
      });

      expect(updated?.name).toBe('Keep Mono Renamed');
      expect(updated?.logoInitials).toBe('KM');
      expect(updated?.logoColor).toBe('#7355be');
    });

    it('returns the stored group when the payload carries nothing to write', async () => {
      const group = await helpers.createAccountGroup({
        name: 'Nothing To Write',
        logoInitials: 'NW',
        logoColor: '#7355be',
        raw: true,
      });

      const res = await helpers.updateAccountGroup({ groupId: group.id, raw: false });
      expect(res.statusCode).toBe(200);

      const [updated] = helpers.extractResponse(res);
      expect(updated).toMatchObject({
        id: group.id,
        name: 'Nothing To Write',
        logoDomain: null,
        logoInitials: 'NW',
        logoColor: '#7355be',
      });
    });

    it('clears a monogram back to null when both logo fields are sent as null', async () => {
      const group = await helpers.createAccountGroup({
        name: 'Reset Mono',
        logoInitials: 'RM',
        logoColor: '#7355be',
        raw: true,
      });

      const [updated] = await helpers.updateAccountGroup({
        groupId: group.id,
        logoDomain: null,
        logoInitials: null,
        raw: true,
      });

      expect(updated?.logoDomain).toBeNull();
      expect(updated?.logoInitials).toBeNull();
      expect(updated?.logoColor).toBeNull();
      expect(updated).not.toHaveProperty('logoSource');
    });

    it('leaves a cleared group indistinguishable from one that never had a logo', async () => {
      const cleared = await helpers.createAccountGroup({
        name: 'Was Branded',
        logoDomain: 'apple.com',
        raw: true,
      });
      const pristine = await helpers.createAccountGroup({ name: 'Never Branded', raw: true });

      await helpers.updateAccountGroup({
        groupId: cleared.id,
        logoDomain: null,
        logoInitials: null,
        raw: true,
      });

      const clearedItem = await findGroupInList({ id: cleared.id });
      const pristineItem = await findGroupInList({ id: pristine.id });

      const logoFields = { logoDomain: null, logoInitials: null, logoColor: null };
      expect(clearedItem).toMatchObject(logoFields);
      expect(pristineItem).toMatchObject(logoFields);
      expect(clearedItem).not.toHaveProperty('logoSource');
    });

    it('returns 422 when logoColor is sent for a group without initials', async () => {
      const group = await helpers.createAccountGroup({ name: 'No Initials Yet', raw: true });

      const res = await helpers.updateAccountGroup({
        groupId: group.id,
        logoColor: '#7355be',
        raw: false,
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('returns 422 when the payload carries both logoDomain and logoInitials', async () => {
      const group = await helpers.createAccountGroup({ name: 'Both On Update', raw: true });

      const res = await helpers.updateAccountGroup({
        groupId: group.id,
        logoDomain: 'netflix.com',
        logoInitials: 'NF',
        raw: false,
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('returns 422 when logoDomain contains a space', async () => {
      const group = await helpers.createAccountGroup({ name: 'Space Domain', raw: true });

      const res = await helpers.updateAccountGroup({
        groupId: group.id,
        logoDomain: 'has space',
        raw: false,
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('returns 422 when logoDomain contains a slash', async () => {
      const group = await helpers.createAccountGroup({ name: 'Slash Domain', raw: true });

      const res = await helpers.updateAccountGroup({
        groupId: group.id,
        logoDomain: 'netflix.com/logo.png',
        raw: false,
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('returns 422 for logoInitials longer than two graphemes', async () => {
      const group = await helpers.createAccountGroup({ name: 'Long Initials', raw: true });

      const res = await helpers.updateAccountGroup({
        groupId: group.id,
        logoInitials: 'ABC',
        raw: false,
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('returns 422 for a malformed logoColor', async () => {
      const group = await helpers.createAccountGroup({
        name: 'Bad Recolor',
        logoInitials: 'BR',
        logoColor: '#7355be',
        raw: true,
      });

      const res = await helpers.updateAccountGroup({
        groupId: group.id,
        logoColor: 'violet',
        raw: false,
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('returns 404 for a group that does not exist', async () => {
      const res = await helpers.updateAccountGroup({
        groupId: generateRandomRecordId(),
        logoDomain: 'example.com',
        raw: false,
      });

      expect(res.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it("returns 404 when a different user tries to set another user's group logo", async () => {
      const group = await helpers.createAccountGroup({
        name: 'LogoCrossUserGuard',
        logoDomain: 'owned.com',
        raw: true,
      });

      const handle = await helpers.signUpSecondUser();
      const response = await helpers.asUser({
        cookies: handle.cookies,
        fn: () =>
          helpers.updateAccountGroup({
            groupId: group.id,
            logoDomain: 'hijack.com',
            raw: false,
          }),
      });
      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);

      // The foreign PUT is blocked: the owner's logo is unchanged.
      const after = await findGroupInList({ id: group.id });
      expect(after?.logoDomain).toBe('owned.com');
    });

    it("returns 404 when a different user tries to clear another user's group logo", async () => {
      const group = await helpers.createAccountGroup({
        name: 'ClearCrossUserGuard',
        logoDomain: 'owned.com',
        raw: true,
      });

      const handle = await helpers.signUpSecondUser();
      const response = await helpers.asUser({
        cookies: handle.cookies,
        fn: () =>
          helpers.updateAccountGroup({
            groupId: group.id,
            logoDomain: null,
            logoInitials: null,
            raw: false,
          }),
      });
      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);

      const after = await findGroupInList({ id: group.id });
      expect(after?.logoDomain).toBe('owned.com');
    });
  });
});

// ---------------------------------------------------------------------------
// GET /api/account-group – serializer must expose the logo fields
// ---------------------------------------------------------------------------

describe('AccountGroup logo read path', () => {
  it('returns the logo fields on GET /account-group', async () => {
    const withDomain = await helpers.createAccountGroup({
      name: 'Listed Domain',
      logoDomain: 'listed.example',
      raw: true,
    });
    const withMonogram = await helpers.createAccountGroup({
      name: 'Listed Mono',
      logoInitials: 'LM',
      logoColor: '#7355be',
      raw: true,
    });

    const list = await helpers.getAccountGroups({ raw: true });

    const domainItem = list.find((group) => group.id === withDomain.id);
    expect(domainItem?.logoDomain).toBe('listed.example');
    expect(domainItem?.logoInitials).toBeNull();
    expect(domainItem?.logoColor).toBeNull();
    expect(domainItem).not.toHaveProperty('logoSource');

    const monogramItem = list.find((group) => group.id === withMonogram.id);
    expect(monogramItem?.logoInitials).toBe('LM');
    expect(monogramItem?.logoColor).toBe('#7355be');
    expect(monogramItem?.logoDomain).toBeNull();
    expect(monogramItem).not.toHaveProperty('logoSource');
  });
});
