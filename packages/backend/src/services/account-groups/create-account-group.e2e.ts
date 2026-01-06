import { describe, expect, it } from 'vitest';
import * as helpers from '@tests/helpers';

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
      parentGroupId: 99999,
    });

    expect(response.statusCode).toBe(404);
  });
});
