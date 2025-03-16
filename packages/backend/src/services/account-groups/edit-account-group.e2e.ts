import { expect } from '@jest/globals';
import * as helpers from '@tests/helpers';

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
      groupId: 999,
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
      parentGroupId: 9999,
      groupId: group.id,
    });

    expect(updation.statusCode).toBe(404);
  });
});
