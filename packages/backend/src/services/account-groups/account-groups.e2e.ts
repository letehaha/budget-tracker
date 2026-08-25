import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import BrandLogos from '@models/brand-logos.model';
import * as helpers from '@tests/helpers';

async function findGroupInList({ id }: { id: string }) {
  const groups = await helpers.getAccountGroups({ raw: true });
  return groups.find((group) => group.id === id);
}

describe('Create account group', () => {
  const groupName = 'Test group';

  it('successfully creates accounts group', async () => {
    await helpers.createAccountGroup({
      name: groupName,
      raw: true,
    });

    const response = await helpers.getAccountGroups({ raw: true });

    expect(response.length).toBe(1);
    expect(!!response.find((i) => i.name === groupName)).toBe(true);
  });

  it('cannot create accounts group with the same name', async () => {
    await helpers.createAccountGroup({
      name: groupName,
      raw: true,
    });
    await helpers.createAccountGroup({
      name: groupName,
    });

    const response = await helpers.getAccountGroups({ raw: true });

    expect(response.length).toBe(2);
  });

  it('successfully creates with parent group of deep nesting with several children', async () => {
    const level1 = await helpers.createAccountGroup({
      name: 'level-1',
      raw: true,
    });

    const level2 = await helpers.createAccountGroup({
      name: 'level-2',
      parentGroupId: level1.id,
      raw: true,
    });

    await helpers.createAccountGroup({
      name: 'level-3-1',
      parentGroupId: level2.id,
    });

    await helpers.createAccountGroup({
      name: 'level-3-2',
      parentGroupId: level2.id,
    });

    const response = await helpers.getAccountGroups({ raw: true });

    expect(response.length).toBe(4);
  });

  it('fails when non-existent parentGroupId provided', async () => {
    const response = await helpers.createAccountGroup({
      name: 'level-1',
      parentGroupId: generateRandomRecordId(),
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns 404 when user B creates a group parented under user A's group", async () => {
    const userAGroup = await helpers.createAccountGroup({
      name: 'userA-group',
      raw: true,
    });

    const userB = await helpers.provisionSecondUserWithBaseCurrency();

    const res = await helpers.asUser({
      cookies: userB.cookies,
      fn: () =>
        helpers.createAccountGroup({
          name: 'userB-group',
          parentGroupId: userAGroup.id,
        }),
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('Update account group', () => {
  const defaultName = 'Test group';

  it('successfully updates record', async () => {
    const newName = 'test-1';
    const group = await helpers.createAccountGroup({
      name: defaultName,
      raw: true,
    });

    const result = await helpers.updateAccountGroup({
      name: newName,
      groupId: group.id,
      raw: true,
    });

    expect(result.length).toBe(1);
    expect(result[0]!.name).toBe(newName);

    const response = await helpers.getAccountGroups({ raw: true });

    expect(response.length).toBe(1);
    expect(response.find((i) => i.name === defaultName)).toBe(undefined);
    expect(!!response.find((i) => i.name === newName)).toBe(true);
  });

  it('fails when tries to update unexisting record', async () => {
    const response = await helpers.updateAccountGroup({
      name: 'foo',
      groupId: generateRandomRecordId(),
    });

    expect(response.statusCode).toBe(404);
  });

  it('updates both name and parent group', async () => {
    const root_1 = await helpers.createAccountGroup({
      name: 'level-1',
      raw: true,
    });
    const group = await helpers.createAccountGroup({
      name: defaultName,
      raw: true,
    });

    const newName = 'test-1';
    const updation_1 = await helpers.updateAccountGroup({
      name: newName,
      parentGroupId: root_1.id,
      groupId: group.id,
      raw: true,
    });

    expect(updation_1.length).toBe(1);
    expect(updation_1[0]!.name).toBe(newName);
    expect(updation_1[0]!.parentGroupId).toBe(root_1.id);

    const root_2 = await helpers.createAccountGroup({
      name: 'level-1-2',
      raw: true,
    });
    const updation_2 = await helpers.updateAccountGroup({
      parentGroupId: root_2.id,
      groupId: group.id,
      raw: true,
    });

    expect(updation_2.length).toBe(1);
    expect(updation_2[0]!.name).toBe(newName);
    expect(updation_2[0]!.parentGroupId).toBe(root_2.id);

    const response = await helpers.getAccountGroups({ raw: true });

    expect(response.length).toBe(3);
  });

  it('sucessfully sets new name that is already connected to another group', async () => {
    const newName = 'test-1';
    await helpers.createAccountGroup({
      name: newName,
      raw: true,
    });
    const group = await helpers.createAccountGroup({
      name: defaultName,
      raw: true,
    });

    const updation = await helpers.updateAccountGroup({
      name: newName,
      groupId: group.id,
    });

    expect(updation.statusCode).toBe(200);
  });

  it('fails when tries to update to unexisting parentGroup', async () => {
    const group = await helpers.createAccountGroup({
      name: defaultName,
      raw: true,
    });

    const updation = await helpers.updateAccountGroup({
      name: 'test1',
      parentGroupId: generateRandomRecordId(),
      groupId: group.id,
    });

    expect(updation.statusCode).toBe(404);
  });

  it("returns 404 when user B tries to update user A's group", async () => {
    const userAGroup = await helpers.createAccountGroup({
      name: defaultName,
      raw: true,
    });

    const userB = await helpers.provisionSecondUserWithBaseCurrency();

    const res = await helpers.asUser({
      cookies: userB.cookies,
      fn: () =>
        helpers.updateAccountGroup({
          groupId: userAGroup.id,
          name: 'hacked',
        }),
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when user B tries to reparent their group under user A's group", async () => {
    const userAGroup = await helpers.createAccountGroup({
      name: defaultName,
      raw: true,
    });

    const userB = await helpers.provisionSecondUserWithBaseCurrency();
    const userBGroup = await helpers.asUser({
      cookies: userB.cookies,
      fn: () => helpers.createAccountGroup({ name: 'userB-group', raw: true }),
    });

    const res = await helpers.asUser({
      cookies: userB.cookies,
      fn: () =>
        helpers.updateAccountGroup({
          groupId: userBGroup.id,
          parentGroupId: userAGroup.id,
        }),
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('Delete account group', () => {
  it('successfully deletes record', async () => {
    const group = await helpers.createAccountGroup({
      name: 'test',
      raw: true,
    });

    const result = await helpers.deleteAccountGroup({
      groupId: group.id,
    });

    expect(result.statusCode).toBe(200);
  });
  it('returns successful response for non-existing record deletion', async () => {
    const result = await helpers.deleteAccountGroup({
      groupId: generateRandomRecordId(),
    });

    expect(result.statusCode).toBe(200);
  });
});

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
