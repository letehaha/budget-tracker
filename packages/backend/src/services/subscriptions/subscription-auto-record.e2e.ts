import { SUBSCRIPTION_FREQUENCIES, SUBSCRIPTION_PERIOD_STATUSES, SUBSCRIPTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import SubscriptionPeriods from '@models/subscription-periods.model';
import Subscriptions from '@models/subscriptions.model';
import { redisClient } from '@root/redis-client';
import { buildLockKey } from '@services/currencies/base-currency-lock';
import * as helpers from '@tests/helpers';
import { addDays, format, subDays } from 'date-fns';

import { processAutoRecordPeriods } from './process-auto-record';

const todayStr = format(new Date(), 'yyyy-MM-dd');

/**
 * Build an auto-record-ready subscription via the API. Uses `dueDate=today` so
 * the first period is generated immediately, then optionally backdates that
 * period via the ORM (the API has no setter for the period's date) so a single
 * test can stage `due today`, `due yesterday`, or `due tomorrow` without
 * juggling system time.
 */
async function createAutoRecordSubscription({
  name,
  accountId,
  amount = 12.5,
  currencyCode,
  periodDueDate = todayStr,
  periodStatus,
}: {
  name: string;
  accountId: string;
  amount?: number;
  currencyCode?: string;
  periodDueDate?: string;
  periodStatus?: SUBSCRIPTION_PERIOD_STATUSES;
}) {
  const sub = await helpers.createSubscription({
    name,
    type: SUBSCRIPTION_TYPES.subscription,
    frequency: SUBSCRIPTION_FREQUENCIES.monthly,
    startDate: todayStr,
    dueDate: todayStr,
    accountId,
    expectedAmount: amount,
    expectedCurrencyCode: currencyCode ?? global.BASE_CURRENCY.code,
    autoRecord: true,
    raw: true,
  });

  if (periodDueDate !== todayStr || periodStatus) {
    const update: Record<string, unknown> = { dueDate: periodDueDate };
    if (periodStatus) update.status = periodStatus;
    await SubscriptionPeriods.update(update, { where: { subscriptionId: sub.id } });
  }

  return sub;
}

async function countTransactionsForAccount({ accountId }: { accountId: string }): Promise<number> {
  const txs = await helpers.getTransactions({ accountIds: [accountId], raw: true });
  return txs.length;
}

describe('Subscription auto-record cron', () => {
  describe('happy path', () => {
    it('books a transaction and marks the period paid for a due upcoming period', async () => {
      const account = await helpers.createAccount({ raw: true });

      const sub = await createAutoRecordSubscription({
        name: 'Auto netflix',
        accountId: account.id,
      });

      const result = await processAutoRecordPeriods();

      expect(result.booked).toBe(1);
      expect(result.failed).toBe(0);

      const { periods } = await helpers.getSubscriptionPeriods({ id: sub.id, raw: true });
      expect(periods.length).toBeGreaterThanOrEqual(1);

      const paid = periods.find((p) => p.status === SUBSCRIPTION_PERIOD_STATUSES.paid);
      expect(paid).toBeDefined();
      expect(paid!.transactionId).not.toBeNull();
      expect(paid!.transactionAutoCreated).toBe(true);

      const txCount = await countTransactionsForAccount({ accountId: account.id });
      expect(txCount).toBe(1);
    });

    it('ensures the next upcoming period after booking the current one', async () => {
      const account = await helpers.createAccount({ raw: true });

      const sub = await createAutoRecordSubscription({
        name: 'Recurring',
        accountId: account.id,
      });

      await processAutoRecordPeriods();

      const { periods } = await helpers.getSubscriptionPeriods({ id: sub.id, raw: true });
      const upcoming = periods.filter((p) => p.status === SUBSCRIPTION_PERIOD_STATUSES.upcoming);
      expect(upcoming.length).toBe(1);
      expect(upcoming[0]!.dueDate > todayStr).toBe(true);
    });

    it('dates the booked transaction at the period dueDate, not the current time', async () => {
      const account = await helpers.createAccount({ raw: true });
      const dueDate = format(subDays(new Date(), 1), 'yyyy-MM-dd');

      await createAutoRecordSubscription({
        name: 'Backdated',
        accountId: account.id,
        periodDueDate: dueDate,
      });

      await processAutoRecordPeriods();

      const txs = await helpers.getTransactions({ accountIds: [account.id], raw: true });
      expect(txs.length).toBe(1);
      expect(txs[0]!.time.toString().slice(0, 10)).toBe(dueDate);
    });
  });

  describe('forward-only semantics', () => {
    it('skips a period that is already overdue when the cron runs', async () => {
      const account = await helpers.createAccount({ raw: true });

      await createAutoRecordSubscription({
        name: 'Slipped',
        accountId: account.id,
        periodDueDate: format(subDays(new Date(), 5), 'yyyy-MM-dd'),
        periodStatus: SUBSCRIPTION_PERIOD_STATUSES.overdue,
      });

      const result = await processAutoRecordPeriods();

      expect(result.booked).toBe(0);
      expect(await countTransactionsForAccount({ accountId: account.id })).toBe(0);
    });

    it('skips a future-dated upcoming period (dueDate > today)', async () => {
      const account = await helpers.createAccount({ raw: true });

      await createAutoRecordSubscription({
        name: 'Future',
        accountId: account.id,
        periodDueDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
      });

      const result = await processAutoRecordPeriods();

      expect(result.booked).toBe(0);
      expect(await countTransactionsForAccount({ accountId: account.id })).toBe(0);
    });
  });

  describe('subscription filters', () => {
    it('skips subscriptions with autoRecord=false', async () => {
      const account = await helpers.createAccount({ raw: true });

      await helpers.createSubscription({
        name: 'Manual',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: todayStr,
        dueDate: todayStr,
        accountId: account.id,
        expectedAmount: 9,
        expectedCurrencyCode: global.BASE_CURRENCY.code,
        autoRecord: false,
        raw: true,
      });

      const result = await processAutoRecordPeriods();
      expect(result.booked).toBe(0);
    });

    it('skips paused (isActive=false) subscriptions', async () => {
      const account = await helpers.createAccount({ raw: true });

      const sub = await createAutoRecordSubscription({
        name: 'Paused',
        accountId: account.id,
      });
      await Subscriptions.update({ isActive: false }, { where: { id: sub.id } });

      const result = await processAutoRecordPeriods();
      expect(result.booked).toBe(0);
    });

    it('skips finished installments (completedAt set)', async () => {
      const account = await helpers.createAccount({ raw: true });

      const sub = await createAutoRecordSubscription({
        name: 'Finished',
        accountId: account.id,
      });
      await Subscriptions.update({ completedAt: new Date() }, { where: { id: sub.id } });

      const result = await processAutoRecordPeriods();
      expect(result.booked).toBe(0);
    });
  });

  describe('idempotency + isolation', () => {
    it('does not double-book on a second tick', async () => {
      const account = await helpers.createAccount({ raw: true });

      await createAutoRecordSubscription({
        name: 'Idempotent',
        accountId: account.id,
      });

      await processAutoRecordPeriods();
      const second = await processAutoRecordPeriods();

      expect(second.booked).toBe(0);
      expect(await countTransactionsForAccount({ accountId: account.id })).toBe(1);
    });

    it('books every eligible period in a single tick across multiple subscriptions', async () => {
      const accountA = await helpers.createAccount({ raw: true });
      const accountB = await helpers.createAccount({ raw: true });

      await createAutoRecordSubscription({ name: 'A', accountId: accountA.id });
      await createAutoRecordSubscription({ name: 'B', accountId: accountB.id });

      const result = await processAutoRecordPeriods();
      expect(result.booked).toBe(2);
      expect(result.failed).toBe(0);
    });
  });

  describe('base-currency lock', () => {
    it('skips a locked user this tick, then books once the lock clears', async () => {
      const { id: userId } = await helpers.getUserInfo({ raw: true });
      const account = await helpers.createAccount({ raw: true });
      await createAutoRecordSubscription({ name: 'Locked user', accountId: account.id });

      await redisClient.set(buildLockKey(userId), 'test-lock');
      try {
        const locked = await processAutoRecordPeriods();
        expect(locked.booked).toBe(0);
        expect(await countTransactionsForAccount({ accountId: account.id })).toBe(0);
      } finally {
        await redisClient.del(buildLockKey(userId));
      }

      const unlocked = await processAutoRecordPeriods();
      expect(unlocked.booked).toBe(1);
      expect(await countTransactionsForAccount({ accountId: account.id })).toBe(1);
    });
  });

  describe('create validation', () => {
    it('rejects autoRecord=true without an accountId', async () => {
      const res = await helpers.createSubscription({
        name: 'No account',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: todayStr,
        dueDate: todayStr,
        expectedAmount: 5,
        expectedCurrencyCode: global.BASE_CURRENCY.code,
        autoRecord: true,
      });

      expect(res.statusCode).toBe(422);
    });

    it('rejects autoRecord=true without expectedAmount + expectedCurrencyCode', async () => {
      const account = await helpers.createAccount({ raw: true });

      const res = await helpers.createSubscription({
        name: 'No amount',
        type: SUBSCRIPTION_TYPES.bill,
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: todayStr,
        dueDate: todayStr,
        accountId: account.id,
        autoRecord: true,
      });

      expect(res.statusCode).toBe(422);
    });

    it('rejects autoRecord=true alongside non-empty matchingRules', async () => {
      const account = await helpers.createAccount({ raw: true });

      const res = await helpers.createSubscription({
        name: 'Both',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: todayStr,
        dueDate: todayStr,
        accountId: account.id,
        expectedAmount: 7,
        expectedCurrencyCode: global.BASE_CURRENCY.code,
        autoRecord: true,
        matchingRules: {
          rules: [{ field: 'note', operator: 'contains_any', value: ['x'] }],
        },
      });

      expect(res.statusCode).toBe(422);
    });
  });

  describe('update validation', () => {
    it('rejects flipping autoRecord ON when the stored row has no account', async () => {
      const sub = await helpers.createSubscription({
        name: 'Account-less',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: todayStr,
        dueDate: todayStr,
        expectedAmount: 4,
        expectedCurrencyCode: global.BASE_CURRENCY.code,
        raw: true,
      });

      const res = await helpers.updateSubscription({
        id: sub.id,
        autoRecord: true,
      });

      expect(res.statusCode).toBe(422);
    });

    it('rejects adding matching rules to an existing auto-record subscription', async () => {
      const account = await helpers.createAccount({ raw: true });

      const sub = await createAutoRecordSubscription({
        name: 'Already auto',
        accountId: account.id,
      });

      const res = await helpers.updateSubscription({
        id: sub.id,
        matchingRules: {
          rules: [{ field: 'note', operator: 'contains_any', value: ['x'] }],
        },
      });

      expect(res.statusCode).toBe(422);
    });
  });
});

describe('User settings defaultAutoRecord', () => {
  it('persists subscriptions.defaultAutoRecord across PATCH', async () => {
    const before = await helpers.getUserSettings({ raw: true });
    expect(before.subscriptions?.defaultAutoRecord).toBeFalsy();

    await helpers.patchUserSettings({
      patch: { subscriptions: { defaultAutoRecord: true } },
    });

    const after = await helpers.getUserSettings({ raw: true });
    expect(after.subscriptions?.defaultAutoRecord).toBe(true);
  });
});
