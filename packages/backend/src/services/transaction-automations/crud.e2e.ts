import type { AutomationConditions, RecordId } from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import type { ErrorResponse } from '@tests/helpers/common';

const noteConditions: AutomationConditions = {
  match: 'all',
  items: [{ field: 'note', operator: 'contains_any', value: ['uber'] }],
};

const createRule = (name: string) =>
  helpers.createAutomation({
    payload: helpers.buildAutomationPayload({ name, conditions: noteConditions }),
    raw: true,
  });

describe('Transaction automations CRUD', () => {
  it('returns an empty list when the user has no rules', async () => {
    expect(await helpers.listAutomations({ raw: true })).toEqual([]);
  });

  it('creates a rule and returns it in the list', async () => {
    const created = await helpers.createAutomation({
      payload: helpers.buildAutomationPayload({
        name: 'Uber is transport',
        conditions: noteConditions,
        actions: [{ type: 'set_note', mode: 'append', value: 'ride' }],
      }),
      raw: true,
    });

    expect(created.name).toBe('Uber is transport');
    expect(created.isEnabled).toBe(true);
    expect(created.position).toBe(0);
    expect(created.matchCount).toBe(0);
    expect(created.pausedReason).toBe(null);
    expect(created.conditions).toEqual(noteConditions);

    const list = await helpers.listAutomations({ raw: true });
    expect(list.map((rule) => rule.id)).toEqual([created.id]);
  });

  it('appends each new rule after the previous one', async () => {
    const first = await createRule('first');
    const second = await createRule('second');

    expect([first.position, second.position]).toEqual([0, 1]);
    expect((await helpers.listAutomations({ raw: true })).map((rule) => rule.name)).toEqual(['first', 'second']);
  });

  it('patches name, conditions and enabled state', async () => {
    const rule = await createRule('before');
    const nextConditions: AutomationConditions = {
      match: 'any',
      items: [{ field: 'dayOfMonth', operator: 'between', value: { min: 1, max: 5 } }],
    };

    const updated = await helpers.updateAutomation({
      id: rule.id,
      payload: { name: 'after', isEnabled: false, conditions: nextConditions },
      raw: true,
    });

    expect(updated.name).toBe('after');
    expect(updated.isEnabled).toBe(false);
    expect(updated.conditions).toEqual(nextConditions);
  });

  it('keeps the surviving rules in order after a delete', async () => {
    const [, second] = [await createRule('a'), await createRule('b'), await createRule('c')];

    await helpers.deleteAutomation({ id: second.id });

    const list = await helpers.listAutomations({ raw: true });
    expect(list.map((rule) => rule.name)).toEqual(['a', 'c']);
    expect(list.map((rule) => rule.id)).not.toContain(second.id);
  });

  it('creates a rule disabled when isEnabled is false', async () => {
    const created = await helpers.createAutomation({
      payload: helpers.buildAutomationPayload({ name: 'off', isEnabled: false, conditions: noteConditions }),
      raw: true,
    });

    expect(created.isEnabled).toBe(false);
    expect((await helpers.listAutomations({ raw: true }))[0]!.isEnabled).toBe(false);
  });

  it('keeps pausedReason and the paused state when the patch only renames', async () => {
    const category = await helpers.addCustomCategory({ name: 'Rides', color: '#00FF00', raw: true });
    const rule = await helpers.createAutomation({
      payload: helpers.buildAutomationPayload({
        actions: [{ type: 'set_category', categoryId: category.id as RecordId }],
      }),
      raw: true,
    });

    await helpers.deleteCustomCategory({ categoryId: category.id });

    const renamed = await helpers.updateAutomation({ id: rule.id, payload: { name: 'renamed' }, raw: true });

    expect(renamed.name).toBe('renamed');
    expect(renamed.isEnabled).toBe(false);
    expect(renamed.pausedReason).toMatchObject({ kind: 'missing_reference', refType: 'category', refId: category.id });
  });

  describe('reorder', () => {
    it('rewrites positions in the given order', async () => {
      const first = await createRule('first');
      const second = await createRule('second');

      const reordered = await helpers.reorderAutomations({ payload: { ids: [second.id, first.id] }, raw: true });

      expect(reordered.map((rule) => [rule.name, rule.position])).toEqual([
        ['second', 0],
        ['first', 1],
      ]);
      expect((await helpers.listAutomations({ raw: true })).map((rule) => rule.name)).toEqual(['second', 'first']);
    });

    it('returns 409 when the id set does not match the user rules', async () => {
      const first = await createRule('first');
      await createRule('second');

      const res = await helpers.reorderAutomations({ payload: { ids: [first.id] } });
      expect(res.statusCode).toBe(409);
    });

    it('returns 409 when a same-length id set names a rule the user does not own', async () => {
      const first = await createRule('first');
      await createRule('second');

      const res = await helpers.reorderAutomations({
        payload: { ids: [first.id, generateRandomRecordId() as RecordId] },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe('validation', () => {
    it('rejects more conditions than the cap allows', async () => {
      const res = await helpers.createAutomation({
        payload: helpers.buildAutomationPayload({
          conditions: {
            match: 'all',
            items: Array.from({ length: 11 }, () => ({
              field: 'note' as const,
              operator: 'contains_any' as const,
              value: ['x'],
            })),
          },
        }),
      });

      expect(res.statusCode).toBe(422);
    });

    it('rejects a set_category action pointing at another user category', async () => {
      const second = await helpers.signUpSecondUser();
      const foreignCategory = await helpers.asUser({
        cookies: second.cookies,
        fn: () => helpers.addCustomCategory({ name: 'Foreign', color: '#FF0000', raw: true }),
      });

      const res = await helpers.createAutomation({
        payload: helpers.buildAutomationPayload({
          actions: [{ type: 'set_category', categoryId: foreignCategory.id as RecordId }],
        }),
      });

      expect(res.statusCode).toBe(422);
      expect((res.body.response as unknown as ErrorResponse).details?.path).toBe('actions[0]');
    });

    it('refuses to re-enable a rule whose category was deleted', async () => {
      const category = await helpers.addCustomCategory({ name: 'Rides', color: '#00FF00', raw: true });
      const rule = await helpers.createAutomation({
        payload: helpers.buildAutomationPayload({
          actions: [{ type: 'set_category', categoryId: category.id as RecordId }],
        }),
        raw: true,
      });

      await helpers.deleteCustomCategory({ categoryId: category.id });

      const res = await helpers.updateAutomation({ id: rule.id, payload: { isEnabled: true } });
      expect(res.statusCode).toBe(422);
      expect((res.body.response as unknown as ErrorResponse).details?.path).toBe('actions[0]');
    });
  });

  describe('ownership', () => {
    it('404s another user rule on patch and delete', async () => {
      const rule = await createRule('mine');
      const second = await helpers.signUpSecondUser();

      await helpers.asUser({
        cookies: second.cookies,
        fn: async () => {
          expect((await helpers.updateAutomation({ id: rule.id, payload: { name: 'stolen' } })).statusCode).toBe(404);
          expect((await helpers.deleteAutomation({ id: rule.id })).statusCode).toBe(404);
          expect(await helpers.listAutomations({ raw: true })).toEqual([]);
        },
      });
    });
  });
});
