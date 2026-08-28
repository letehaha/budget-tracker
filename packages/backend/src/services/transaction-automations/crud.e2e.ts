import type { AutomationCondition, AutomationConditions, RecordId } from '@bt/shared/types';
import { asDecimal } from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import type { ErrorResponse } from '@tests/helpers/common';
import { getLunchFlowBalanceMock, getLunchFlowTransactionsMock } from '@tests/mocks/lunchflow/mock-api';

const noteConditions: AutomationConditions = {
  match: 'all',
  items: [{ field: 'note', operator: 'contains_any', value: ['uber'] }],
};

const createRule = (name: string) =>
  helpers.createAutomation({
    payload: helpers.buildAutomationPayload({ name, conditions: noteConditions }),
    raw: true,
  });

const conditionRule = async ({ name, item }: { name: string; item: AutomationCondition }) =>
  helpers.createAutomation({
    payload: {
      name,
      conditions: { match: 'all', items: [item] },
      actions: [{ type: 'set_note', mode: 'append', value: 'automated' }],
    },
    raw: true,
  });

const setPayeeRule = ({ name, payeeId }: { name: string; payeeId: RecordId }) =>
  helpers.createAutomation({
    payload: {
      name,
      conditions: { match: 'all', items: [{ field: 'note', operator: 'contains_any', value: ['uber'] }] },
      actions: [{ type: 'set_payee', payeeId }],
    },
    raw: true,
  });

const syncLunchFlow = async ({ description }: { description: string }) => {
  const { connectionId } = await helpers.lunchflow.pair();

  global.mswMockServer.use(
    getLunchFlowTransactionsMock({
      response: {
        transactions: [
          {
            id: generateRandomRecordId(),
            accountId: 1001,
            amount: asDecimal(-25),
            currency: 'USD',
            date: new Date().toISOString(),
            merchant: 'Merchant',
            description,
            isPending: false,
          },
        ],
        total: 1,
      },
    }),
    getLunchFlowBalanceMock(),
  );

  const { accounts } = await helpers.bankDataProviders.listExternalAccounts({ connectionId, raw: true });
  await helpers.bankDataProviders.connectSelectedAccounts({
    connectionId,
    accountExternalIds: [accounts[0]!.externalId],
    raw: true,
  });

  return (await helpers.getTransactions({ raw: true })).find((tx) => tx.note === description);
};

describe('Transaction automations CRUD', () => {
  it('starts empty, then appends each created rule with its defaults', async () => {
    expect(await helpers.listAutomations({ raw: true })).toEqual([]);

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
    expect((await helpers.listAutomations({ raw: true })).map((rule) => rule.id)).toEqual([created.id]);

    const second = await createRule('second');

    expect([created.position, second.position]).toEqual([0, 1]);
    expect((await helpers.listAutomations({ raw: true })).map((rule) => rule.name)).toEqual([
      'Uber is transport',
      'second',
    ]);

    const disabled = await helpers.createAutomation({
      payload: helpers.buildAutomationPayload({ name: 'off', isEnabled: false, conditions: noteConditions }),
      raw: true,
    });

    expect(disabled.isEnabled).toBe(false);
    const list = await helpers.listAutomations({ raw: true });
    expect(list.find((rule) => rule.id === disabled.id)?.isEnabled).toBe(false);
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

  describe('reorder', () => {
    it('rejects an id set that does not match the user rules and rewrites positions otherwise', async () => {
      const first = await createRule('first');
      const second = await createRule('second');

      const tooShort = await helpers.reorderAutomations({ payload: { ids: [first.id] } });
      expect(tooShort.statusCode).toBe(409);

      const foreign = await helpers.reorderAutomations({
        payload: { ids: [first.id, generateRandomRecordId() as RecordId] },
      });
      expect(foreign.statusCode).toBe(409);

      const reordered = await helpers.reorderAutomations({ payload: { ids: [second.id, first.id] }, raw: true });

      expect(reordered.map((rule) => [rule.name, rule.position])).toEqual([
        ['second', 0],
        ['first', 1],
      ]);
      expect((await helpers.listAutomations({ raw: true })).map((rule) => rule.name)).toEqual(['second', 'first']);
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

describe('Transaction automations reference lifecycle', () => {
  it('pauses a rule whose category was deleted and lets the rule below it fire', async () => {
    const token = generateRandomRecordId();
    const [deleted, survivor] = await Promise.all([
      helpers.addCustomCategory({ name: `Deleted ${token}`, color: '#111111', raw: true }),
      helpers.addCustomCategory({ name: `Survivor ${token}`, color: '#222222', raw: true }),
    ]);

    const topRule = await helpers.createAutomation({
      payload: {
        name: 'top',
        conditions: { match: 'all', items: [{ field: 'note', operator: 'contains_any', value: ['uber'] }] },
        actions: [{ type: 'set_category', categoryId: deleted.id as RecordId }],
      },
      raw: true,
    });
    await helpers.createAutomation({
      payload: {
        name: 'bottom',
        conditions: { match: 'all', items: [{ field: 'note', operator: 'contains_any', value: ['uber'] }] },
        actions: [{ type: 'set_category', categoryId: survivor.id as RecordId }],
      },
      raw: true,
    });

    await helpers.deleteCustomCategory({ categoryId: deleted.id });

    const paused = await helpers.getAutomationById({ id: topRule.id });
    expect(paused?.isEnabled).toBe(false);
    expect(paused?.pausedReason).toMatchObject({
      kind: 'missing_reference',
      refType: 'category',
      refId: deleted.id,
      label: `Deleted ${token}`,
    });

    const tx = await syncLunchFlow({ description: 'UBER TRIP 1' });
    expect(tx?.categoryId).toBe(survivor.id);
  });

  it('rewrites the action and keeps the rule enabled when the delete names a replacement', async () => {
    const token = generateRandomRecordId();
    const [source, replacement] = await Promise.all([
      helpers.addCustomCategory({ name: `Source ${token}`, color: '#333333', raw: true }),
      helpers.addCustomCategory({ name: `Replacement ${token}`, color: '#444444', raw: true }),
    ]);

    const rule = await helpers.createAutomation({
      payload: {
        name: 'replaced',
        conditions: { match: 'all', items: [{ field: 'note', operator: 'contains_any', value: ['uber'] }] },
        actions: [{ type: 'set_category', categoryId: source.id as RecordId }],
      },
      raw: true,
    });

    await helpers.deleteCustomCategory({ categoryId: source.id, replaceWithCategoryId: replacement.id });

    const updated = await helpers.getAutomationById({ id: rule.id });
    expect(updated?.isEnabled).toBe(true);
    expect(updated?.pausedReason).toBeNull();
    expect(updated?.actions).toEqual([{ type: 'set_category', categoryId: replacement.id }]);
  });

  it('rewrites a payee condition when two payees are merged', async () => {
    const token = generateRandomRecordId();
    const [source, target] = await Promise.all([
      helpers.createPayee({ payload: helpers.buildPayeePayload({ name: `Source ${token}` }), raw: true }),
      helpers.createPayee({ payload: helpers.buildPayeePayload({ name: `Target ${token}` }), raw: true }),
    ]);

    const rule = await conditionRule({
      name: 'payee rule',
      item: { field: 'payee', operator: 'in', value: [source.id as RecordId] },
    });

    await helpers.mergePayees({ sourceId: source.id, targetId: target.id, raw: true });

    const updated = await helpers.getAutomationById({ id: rule.id });
    expect(updated?.isEnabled).toBe(true);
    expect(updated?.conditions.items).toEqual([{ field: 'payee', operator: 'in', value: [target.id] }]);
  });

  it('dedupes a payee list that already holds the merge target', async () => {
    const token = generateRandomRecordId();
    const [source, target] = await Promise.all([
      helpers.createPayee({ payload: helpers.buildPayeePayload({ name: `Source ${token}` }), raw: true }),
      helpers.createPayee({ payload: helpers.buildPayeePayload({ name: `Target ${token}` }), raw: true }),
    ]);

    const rule = await conditionRule({
      name: 'both payees',
      item: { field: 'payee', operator: 'in', value: [source.id as RecordId, target.id as RecordId] },
    });

    await helpers.mergePayees({ sourceId: source.id, targetId: target.id, raw: true });

    const updated = await helpers.getAutomationById({ id: rule.id });
    expect(updated?.conditions.items).toEqual([{ field: 'payee', operator: 'in', value: [target.id] }]);

    // A duplicated list would come back 422 from `uniqueRecordIds` on the next save.
    const renamed = await helpers.updateAutomation({
      id: rule.id,
      payload: { name: 'renamed', conditions: updated!.conditions },
    });
    expect(renamed.statusCode).toBe(200);
  });

  it('pauses a set_payee rule on delete and rewrites it on merge', async () => {
    const token = generateRandomRecordId();
    const [gone, source, target] = await Promise.all([
      helpers.createPayee({ payload: helpers.buildPayeePayload({ name: `Gone ${token}` }), raw: true }),
      helpers.createPayee({ payload: helpers.buildPayeePayload({ name: `Source ${token}` }), raw: true }),
      helpers.createPayee({ payload: helpers.buildPayeePayload({ name: `Target ${token}` }), raw: true }),
    ]);

    const deletedRule = await setPayeeRule({ name: 'deleted payee', payeeId: gone.id as RecordId });
    const mergedRule = await setPayeeRule({ name: 'merged payee', payeeId: source.id as RecordId });

    await helpers.deletePayee({ id: gone.id });
    await helpers.mergePayees({ sourceId: source.id, targetId: target.id, raw: true });

    const paused = await helpers.getAutomationById({ id: deletedRule.id });
    expect(paused?.isEnabled).toBe(false);
    expect(paused?.pausedReason).toMatchObject({ kind: 'missing_reference', refType: 'payee', refId: gone.id });

    const rewritten = await helpers.getAutomationById({ id: mergedRule.id });
    expect(rewritten?.isEnabled).toBe(true);
    expect(rewritten?.actions).toEqual([{ type: 'set_payee', payeeId: target.id }]);
  });

  it('pauses on a deleted tag, account, account group, payee and bank connection', async () => {
    const token = generateRandomRecordId();

    const tag = await helpers.createTag({ payload: helpers.buildTagPayload({ name: `Tag ${token}` }), raw: true });
    const tagRule = await helpers.createAutomation({
      payload: {
        name: 'tag rule',
        conditions: { match: 'all', items: [{ field: 'note', operator: 'contains_any', value: ['x'] }] },
        actions: [{ type: 'add_tags', tagIds: [tag.id as RecordId] }],
      },
      raw: true,
    });

    const account = await helpers.createAccount({ raw: true });
    const accountRule = await conditionRule({
      name: 'account rule',
      item: { field: 'account', operator: 'in', value: [account.id as RecordId] },
    });

    const group = await helpers.createAccountGroup({ name: `Group ${token}`, raw: true });
    const groupRule = await conditionRule({
      name: 'group rule',
      item: { field: 'accountGroup', operator: 'in', value: [group.id as RecordId] },
    });

    const payee = await helpers.createPayee({
      payload: helpers.buildPayeePayload({ name: `Payee ${token}` }),
      raw: true,
    });
    const payeeRule = await conditionRule({
      name: 'payee rule',
      item: { field: 'payee', operator: 'in', value: [payee.id as RecordId] },
    });

    const { connectionId } = await helpers.lunchflow.pair();
    const connectionRule = await conditionRule({
      name: 'connection rule',
      item: { field: 'bankConnection', operator: 'in', value: [connectionId as RecordId] },
    });

    await helpers.deleteTag({ id: tag.id });
    await helpers.deleteAccount({ id: account.id, raw: true });
    await helpers.deleteAccountGroup({ groupId: group.id });
    await helpers.deletePayee({ id: payee.id });
    await helpers.bankDataProviders.disconnectProvider({ connectionId, raw: true });

    const expectations: [RecordId, string, string][] = [
      [tagRule.id, 'tag', tag.name],
      [accountRule.id, 'account', account.name],
      [groupRule.id, 'accountGroup', group.name],
      [payeeRule.id, 'payee', payee.name],
      [connectionRule.id, 'bankConnection', 'LunchFlow'],
    ];

    for (const [id, refType, label] of expectations) {
      const rule = await helpers.getAutomationById({ id: id });
      expect(rule?.isEnabled).toBe(false);
      expect(rule?.pausedReason).toMatchObject({ kind: 'missing_reference', refType, label });
    }
  });

  it('keeps a broken rule paused on rename, refuses to re-enable it, and clears pausedReason once fixed', async () => {
    const token = generateRandomRecordId();
    const [deleted, replacement] = await Promise.all([
      helpers.addCustomCategory({ name: `Gone ${token}`, color: '#555555', raw: true }),
      helpers.addCustomCategory({ name: `Fixed ${token}`, color: '#666666', raw: true }),
    ]);

    const rule = await helpers.createAutomation({
      payload: {
        name: 'broken',
        conditions: { match: 'all', items: [{ field: 'note', operator: 'contains_any', value: ['uber'] }] },
        actions: [{ type: 'set_category', categoryId: deleted.id as RecordId }],
      },
      raw: true,
    });

    await helpers.deleteCustomCategory({ categoryId: deleted.id });

    const renamed = await helpers.updateAutomation({ id: rule.id, payload: { name: 'renamed' }, raw: true });
    expect(renamed.name).toBe('renamed');
    expect(renamed.isEnabled).toBe(false);
    expect(renamed.pausedReason).toMatchObject({ kind: 'missing_reference', refType: 'category', refId: deleted.id });

    const rejected = await helpers.updateAutomation({ id: rule.id, payload: { isEnabled: true } });
    expect(rejected.statusCode).toBe(422);
    expect((rejected.body.response as unknown as ErrorResponse).details?.path).toBe('actions[0]');

    const fixed = await helpers.updateAutomation({
      id: rule.id,
      payload: { isEnabled: true, actions: [{ type: 'set_category', categoryId: replacement.id as RecordId }] },
      raw: true,
    });
    expect(fixed.isEnabled).toBe(true);
    expect(fixed.pausedReason).toBeNull();
  });
});
