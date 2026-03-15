import { NOTIFICATION_TYPES, TAG_REMINDER_FREQUENCIES, TAG_REMINDER_TYPES, TRANSACTION_TYPES } from '@bt/shared/types';
import { beforeEach, describe, expect, it } from '@jest/globals';
import Notifications from '@models/Notifications.model';
import TagReminders from '@models/TagReminders.model';
import Users from '@models/Users.model';
import * as helpers from '@tests/helpers';

import {
  checkRealTimeReminders,
  checkScheduledReminders,
  getDateRangeForRealTimeReminder,
  getDateRangeForScheduledReminder,
  shouldCheckReminderToday,
} from './check-reminders';

describe('Tag Reminders API', () => {
  describe('POST /tags/:tagId/reminders (createTagReminder)', () => {
    it('successfully creates a scheduled tag reminder', async () => {
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Test Tag' }),
        raw: true,
      });

      const reminder = await helpers.createTagReminder({
        tagId: tag.id,
        payload: helpers.buildTagReminderPayload({
          type: TAG_REMINDER_TYPES.amountThreshold,
          frequency: TAG_REMINDER_FREQUENCIES.monthly,
          dayOfMonth: 15,
          settings: { amountThreshold: 500 },
        }),
        raw: true,
      });

      expect(reminder.id).toBeDefined();
      expect(reminder.tagId).toBe(tag.id);
      expect(reminder.type).toBe(TAG_REMINDER_TYPES.amountThreshold);
      expect(reminder.frequency).toBe(TAG_REMINDER_FREQUENCIES.monthly);
      expect(reminder.dayOfMonth).toBe(15);
      expect((reminder.settings as { amountThreshold?: number })?.amountThreshold).toBe(500);
      expect(reminder.isEnabled).toBe(true);
    });

    it('creates a real-time reminder (no schedule)', async () => {
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Real-time Tag' }),
        raw: true,
      });

      const reminder = await helpers.createTagReminder({
        tagId: tag.id,
        payload: helpers.buildRealTimeReminderPayload({
          type: TAG_REMINDER_TYPES.amountThreshold,
          settings: { amountThreshold: 200 },
        }),
        raw: true,
      });

      expect(reminder.type).toBe(TAG_REMINDER_TYPES.amountThreshold);
      expect(reminder.frequency).toBeNull();
      expect(reminder.dayOfMonth).toBeNull();
    });

    it('creates existence check reminder without amount threshold', async () => {
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Existence Test Tag' }),
        raw: true,
      });

      const reminder = await helpers.createTagReminder({
        tagId: tag.id,
        payload: helpers.buildTagReminderPayload({
          type: TAG_REMINDER_TYPES.existenceCheck,
          frequency: TAG_REMINDER_FREQUENCIES.weekly,
          settings: {},
        }),
        raw: true,
      });

      expect(reminder.type).toBe(TAG_REMINDER_TYPES.existenceCheck);
      expect(reminder.frequency).toBe(TAG_REMINDER_FREQUENCIES.weekly);
    });

    it('allows multiple reminders with same type but different settings', async () => {
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Multiple Reminders Tag' }),
        raw: true,
      });

      const reminder1 = await helpers.createTagReminder({
        tagId: tag.id,
        payload: helpers.buildTagReminderPayload({
          type: TAG_REMINDER_TYPES.amountThreshold,
          settings: { amountThreshold: 100 },
        }),
        raw: true,
      });

      const reminder2 = await helpers.createTagReminder({
        tagId: tag.id,
        payload: helpers.buildTagReminderPayload({
          type: TAG_REMINDER_TYPES.amountThreshold,
          settings: { amountThreshold: 500 },
        }),
        raw: true,
      });

      expect(reminder1.id).not.toBe(reminder2.id);
      expect((reminder1.settings as { amountThreshold?: number })?.amountThreshold).toBe(100);
      expect((reminder2.settings as { amountThreshold?: number })?.amountThreshold).toBe(500);
    });

    it('rejects exact duplicate reminders', async () => {
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Duplicate Test Tag' }),
        raw: true,
      });

      await helpers.createTagReminder({
        tagId: tag.id,
        payload: helpers.buildTagReminderPayload({
          type: TAG_REMINDER_TYPES.amountThreshold,
          frequency: TAG_REMINDER_FREQUENCIES.monthly,
          dayOfMonth: 1,
          settings: { amountThreshold: 500 },
        }),
        raw: true,
      });

      const duplicateResponse = await helpers.createTagReminder({
        tagId: tag.id,
        payload: helpers.buildTagReminderPayload({
          type: TAG_REMINDER_TYPES.amountThreshold,
          frequency: TAG_REMINDER_FREQUENCIES.monthly,
          dayOfMonth: 1,
          settings: { amountThreshold: 500 },
        }),
        raw: false,
      });

      expect(duplicateResponse.statusCode).toBe(409);
    });

    it('creates a disabled reminder', async () => {
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Disabled Reminder Tag' }),
        raw: true,
      });

      const reminder = await helpers.createTagReminder({
        tagId: tag.id,
        payload: helpers.buildTagReminderPayload({ isEnabled: false }),
        raw: true,
      });

      expect(reminder.isEnabled).toBe(false);
    });

    it('fails for non-existent tag', async () => {
      const response = await helpers.createTagReminder({
        tagId: 999999,
        payload: helpers.buildTagReminderPayload(),
        raw: false,
      });

      expect(response.statusCode).toBe(404);
    });

    it('accepts valid frequency values', async () => {
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Valid Frequency Tag' }),
        raw: true,
      });

      const reminder = await helpers.createTagReminder({
        tagId: tag.id,
        payload: {
          type: TAG_REMINDER_TYPES.amountThreshold,
          frequency: TAG_REMINDER_FREQUENCIES.quarterly,
          dayOfMonth: 15,
          settings: { amountThreshold: 500 },
        },
        raw: true,
      });

      expect(reminder.frequency).toBe(TAG_REMINDER_FREQUENCIES.quarterly);
      expect(reminder.dayOfMonth).toBe(15);
    });
  });

  describe('GET /tags/:tagId/reminders (getRemindersForTag)', () => {
    it('returns all reminders for a tag', async () => {
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Multi Reminder Tag' }),
        raw: true,
      });

      await helpers.createTagReminder({
        tagId: tag.id,
        payload: helpers.buildTagReminderPayload({
          type: TAG_REMINDER_TYPES.amountThreshold,
          settings: { amountThreshold: 100 },
        }),
        raw: true,
      });
      await helpers.createTagReminder({
        tagId: tag.id,
        payload: helpers.buildTagReminderPayload({
          type: TAG_REMINDER_TYPES.existenceCheck,
          settings: {},
        }),
        raw: true,
      });

      const reminders = await helpers.getRemindersForTag({ tagId: tag.id, raw: true });

      expect(reminders.length).toBeGreaterThanOrEqual(2);
    });

    it('returns empty array for tag with no reminders', async () => {
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'No Reminders Tag' }),
        raw: true,
      });

      const reminders = await helpers.getRemindersForTag({ tagId: tag.id, raw: true });

      expect(reminders).toEqual([]);
    });
  });

  describe('GET /tag-reminders (getAllReminders)', () => {
    it('returns all reminders for the user', async () => {
      const tag1 = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'All Reminders Tag 1' }),
        raw: true,
      });
      const tag2 = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'All Reminders Tag 2' }),
        raw: true,
      });

      await helpers.createTagReminder({
        tagId: tag1.id,
        payload: helpers.buildTagReminderPayload(),
        raw: true,
      });
      await helpers.createTagReminder({
        tagId: tag2.id,
        payload: helpers.buildTagReminderPayload({ settings: { amountThreshold: 2000 } }),
        raw: true,
      });

      const reminders = await helpers.getAllReminders({ raw: true });

      expect(reminders.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('GET /tags/:tagId/reminders/:id (getReminderById)', () => {
    it('returns a specific reminder by ID', async () => {
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Specific Reminder Tag' }),
        raw: true,
      });

      const created = await helpers.createTagReminder({
        tagId: tag.id,
        payload: helpers.buildTagReminderPayload({ settings: { amountThreshold: 1500 } }),
        raw: true,
      });

      const reminder = await helpers.getReminderById({
        tagId: tag.id,
        id: created.id,
        raw: true,
      });

      expect(reminder.id).toBe(created.id);
      expect((reminder.settings as { amountThreshold?: number })?.amountThreshold).toBe(1500);
    });

    it('returns 404 for non-existent reminder', async () => {
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Non Existent Reminder' }),
        raw: true,
      });

      const response = await helpers.getReminderById({
        tagId: tag.id,
        id: 999999,
        raw: false,
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 404 when tagId in URL does not match reminder tagId', async () => {
      const tag1 = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Tag 1' }),
        raw: true,
      });
      const tag2 = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Tag 2' }),
        raw: true,
      });

      const reminder = await helpers.createTagReminder({
        tagId: tag1.id,
        payload: helpers.buildTagReminderPayload(),
        raw: true,
      });

      // Try to get reminder with wrong tagId
      const response = await helpers.getReminderById({
        tagId: tag2.id,
        id: reminder.id,
        raw: false,
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /tags/:tagId/reminders/:id (updateTagReminder)', () => {
    it('updates reminder properties', async () => {
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Update Reminder Tag' }),
        raw: true,
      });

      const created = await helpers.createTagReminder({
        tagId: tag.id,
        payload: helpers.buildTagReminderPayload({
          type: TAG_REMINDER_TYPES.amountThreshold,
          frequency: TAG_REMINDER_FREQUENCIES.monthly,
          settings: { amountThreshold: 1000 },
        }),
        raw: true,
      });

      const updated = await helpers.updateTagReminder({
        tagId: tag.id,
        id: created.id,
        payload: {
          settings: { amountThreshold: 2000 },
          frequency: TAG_REMINDER_FREQUENCIES.weekly,
        },
        raw: true,
      });

      expect(updated.id).toBe(created.id);
      expect((updated.settings as { amountThreshold?: number })?.amountThreshold).toBe(2000);
      expect(updated.frequency).toBe(TAG_REMINDER_FREQUENCIES.weekly);
    });

    it('can disable a reminder', async () => {
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Disable Reminder Tag' }),
        raw: true,
      });

      const created = await helpers.createTagReminder({
        tagId: tag.id,
        payload: helpers.buildTagReminderPayload({ isEnabled: true }),
        raw: true,
      });

      const updated = await helpers.updateTagReminder({
        tagId: tag.id,
        id: created.id,
        payload: { isEnabled: false },
        raw: true,
      });

      expect(updated.isEnabled).toBe(false);
    });

    it('returns 404 for non-existent reminder', async () => {
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Update Non Existent' }),
        raw: true,
      });

      const response = await helpers.updateTagReminder({
        tagId: tag.id,
        id: 999999,
        payload: { isEnabled: false },
        raw: false,
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 404 when tagId in URL does not match reminder tagId', async () => {
      const tag1 = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Update Tag 1' }),
        raw: true,
      });
      const tag2 = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Update Tag 2' }),
        raw: true,
      });

      const reminder = await helpers.createTagReminder({
        tagId: tag1.id,
        payload: helpers.buildTagReminderPayload(),
        raw: true,
      });

      // Try to update reminder with wrong tagId
      const response = await helpers.updateTagReminder({
        tagId: tag2.id,
        id: reminder.id,
        payload: { isEnabled: false },
        raw: false,
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /tags/:tagId/reminders/:id (deleteTagReminder)', () => {
    it('deletes an existing reminder', async () => {
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Delete Reminder Tag' }),
        raw: true,
      });

      const created = await helpers.createTagReminder({
        tagId: tag.id,
        payload: helpers.buildTagReminderPayload(),
        raw: true,
      });

      const deleteResponse = await helpers.deleteTagReminder({
        tagId: tag.id,
        id: created.id,
        raw: false,
      });
      expect(deleteResponse.statusCode).toBe(200);

      const getResponse = await helpers.getReminderById({
        tagId: tag.id,
        id: created.id,
        raw: false,
      });
      expect(getResponse.statusCode).toBe(404);
    });

    it('returns 404 for non-existent reminder', async () => {
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Delete Non Existent' }),
        raw: true,
      });

      const response = await helpers.deleteTagReminder({
        tagId: tag.id,
        id: 999999,
        raw: false,
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 404 when tagId in URL does not match reminder tagId', async () => {
      const tag1 = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Delete Tag 1' }),
        raw: true,
      });
      const tag2 = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Delete Tag 2' }),
        raw: true,
      });

      const reminder = await helpers.createTagReminder({
        tagId: tag1.id,
        payload: helpers.buildTagReminderPayload(),
        raw: true,
      });

      // Try to delete reminder with wrong tagId
      const response = await helpers.deleteTagReminder({
        tagId: tag2.id,
        id: reminder.id,
        raw: false,
      });

      expect(response.statusCode).toBe(404);

      // Verify the reminder still exists with the correct tagId
      const getResponse = await helpers.getReminderById({
        tagId: tag1.id,
        id: reminder.id,
        raw: true,
      });
      expect(getResponse.id).toBe(reminder.id);
    });
  });
});

describe('Tag Reminders Check Service', () => {
  let testUserId: number;

  beforeEach(async () => {
    const user = await Users.findOne({ where: { username: 'test1' } });
    testUserId = user!.id;
  });

  describe('shouldCheckReminderToday', () => {
    it('returns true for reminder without schedule (real-time)', async () => {
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Should Check Real-time' }),
        raw: true,
      });

      const reminder = await helpers.createTagReminder({
        tagId: tag.id,
        payload: helpers.buildRealTimeReminderPayload(),
        raw: true,
      });

      const dbReminder = await TagReminders.findByPk(reminder.id);
      const result = shouldCheckReminderToday({ reminder: dbReminder! });

      // Real-time reminders should NOT be checked by the daily cron
      expect(result).toBe(false);
    });

    it('returns true on matching dayOfMonth for monthly reminders', async () => {
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Monthly Day Match' }),
        raw: true,
      });

      const today = new Date();
      const currentDay = today.getDate();

      const reminder = await helpers.createTagReminder({
        tagId: tag.id,
        payload: helpers.buildTagReminderPayload({
          frequency: TAG_REMINDER_FREQUENCIES.monthly,
          dayOfMonth: currentDay,
        }),
        raw: true,
      });

      const dbReminder = await TagReminders.findByPk(reminder.id);
      const result = shouldCheckReminderToday({ reminder: dbReminder! });

      expect(result).toBe(true);
    });

    it('returns false when dayOfMonth does not match', async () => {
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Monthly Day No Match' }),
        raw: true,
      });

      const today = new Date();
      let differentDay = today.getDate() + 1;
      if (differentDay > 28) differentDay = 1;

      const reminder = await helpers.createTagReminder({
        tagId: tag.id,
        payload: helpers.buildTagReminderPayload({
          frequency: TAG_REMINDER_FREQUENCIES.monthly,
          dayOfMonth: differentDay,
        }),
        raw: true,
      });

      const dbReminder = await TagReminders.findByPk(reminder.id);
      const result = shouldCheckReminderToday({ reminder: dbReminder! });

      expect(result).toBe(false);
    });

    it('returns true for daily reminders', async () => {
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Daily Reminder Test' }),
        raw: true,
      });

      const reminder = await helpers.createTagReminder({
        tagId: tag.id,
        payload: helpers.buildTagReminderPayload({
          frequency: TAG_REMINDER_FREQUENCIES.daily,
        }),
        raw: true,
      });

      const dbReminder = await TagReminders.findByPk(reminder.id);
      const result = shouldCheckReminderToday({ reminder: dbReminder! });

      expect(result).toBe(true);
    });
  });

  describe('getDateRangeForScheduledReminder', () => {
    it('returns correct date range for monthly reminder', async () => {
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Date Range Monthly' }),
        raw: true,
      });

      const reminder = await helpers.createTagReminder({
        tagId: tag.id,
        payload: helpers.buildTagReminderPayload({
          frequency: TAG_REMINDER_FREQUENCIES.monthly,
        }),
        raw: true,
      });

      const dbReminder = await TagReminders.findByPk(reminder.id);
      const { from, to } = getDateRangeForScheduledReminder({ reminder: dbReminder! });

      // Should span approximately 30-31 days
      const daysDiff = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
      expect(daysDiff).toBeGreaterThanOrEqual(28);
      expect(daysDiff).toBeLessThanOrEqual(31);
    });

    it('returns correct date range for weekly reminder', async () => {
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Date Range Weekly' }),
        raw: true,
      });

      const reminder = await helpers.createTagReminder({
        tagId: tag.id,
        payload: helpers.buildTagReminderPayload({
          frequency: TAG_REMINDER_FREQUENCIES.weekly,
          dayOfMonth: null,
        }),
        raw: true,
      });

      const dbReminder = await TagReminders.findByPk(reminder.id);
      const { from, to } = getDateRangeForScheduledReminder({ reminder: dbReminder! });

      const daysDiff = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
      expect(daysDiff).toBeGreaterThanOrEqual(6);
      expect(daysDiff).toBeLessThanOrEqual(7);
    });
  });

  describe('getDateRangeForRealTimeReminder', () => {
    it('returns current month date range', () => {
      const { from, to } = getDateRangeForRealTimeReminder();

      // From should be 1st of current month
      expect(from.getDate()).toBe(1);
      // To should be today
      const today = new Date();
      expect(to.getDate()).toBe(today.getDate());
    });
  });

  describe('checkScheduledReminders - amount threshold', () => {
    it('triggers notification when amount exceeds threshold', async () => {
      const account = await helpers.createAccount({ raw: true });
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Amount Threshold Test' }),
        raw: true,
      });

      const today = new Date();
      const currentDay = today.getDate();

      // Create a transaction
      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 600, // More than threshold of 500
          transactionType: TRANSACTION_TYPES.expense,
          time: today.toISOString(),
        }),
        raw: true,
      });

      await helpers.addTransactionsToTag({
        tagId: tag.id,
        transactionIds: [tx.id],
        raw: true,
      });

      await helpers.createTagReminder({
        tagId: tag.id,
        payload: helpers.buildTagReminderPayload({
          type: TAG_REMINDER_TYPES.amountThreshold,
          frequency: TAG_REMINDER_FREQUENCIES.monthly,
          dayOfMonth: currentDay,
          settings: { amountThreshold: 500 },
          isEnabled: true,
        }),
        raw: true,
      });

      const result = await checkScheduledReminders();

      expect(result.totalChecked).toBeGreaterThan(0);

      const notifications = await Notifications.findAll({
        where: {
          userId: testUserId,
          type: NOTIFICATION_TYPES.tagReminder,
        },
      });

      expect(notifications.length).toBeGreaterThan(0);
    });

    it('does not trigger when amount is below threshold', async () => {
      const account = await helpers.createAccount({ raw: true });
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Below Threshold Test' }),
        raw: true,
      });

      const today = new Date();
      const currentDay = today.getDate();

      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100, // Less than threshold of 500
          transactionType: TRANSACTION_TYPES.expense,
          time: today.toISOString(),
        }),
        raw: true,
      });

      await helpers.addTransactionsToTag({
        tagId: tag.id,
        transactionIds: [tx.id],
        raw: true,
      });

      await helpers.createTagReminder({
        tagId: tag.id,
        payload: helpers.buildTagReminderPayload({
          type: TAG_REMINDER_TYPES.amountThreshold,
          frequency: TAG_REMINDER_FREQUENCIES.monthly,
          dayOfMonth: currentDay,
          settings: { amountThreshold: 500 },
          isEnabled: true,
        }),
        raw: true,
      });

      const notificationsBefore = await Notifications.count({
        where: {
          userId: testUserId,
          type: NOTIFICATION_TYPES.tagReminder,
        },
      });

      await checkScheduledReminders();

      const notificationsAfter = await Notifications.count({
        where: {
          userId: testUserId,
          type: NOTIFICATION_TYPES.tagReminder,
        },
      });

      expect(notificationsAfter).toBe(notificationsBefore);
    });
  });

  describe('checkScheduledReminders - existence check', () => {
    it('triggers notification when transactions exist with the tag', async () => {
      const account = await helpers.createAccount({ raw: true });
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Existence Check Tag' }),
        raw: true,
      });

      const today = new Date();
      const currentDay = today.getDate();

      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 50,
          transactionType: TRANSACTION_TYPES.expense,
          time: today.toISOString(),
        }),
        raw: true,
      });

      await helpers.addTransactionsToTag({
        tagId: tag.id,
        transactionIds: [tx.id],
        raw: true,
      });

      await helpers.createTagReminder({
        tagId: tag.id,
        payload: helpers.buildTagReminderPayload({
          type: TAG_REMINDER_TYPES.existenceCheck,
          frequency: TAG_REMINDER_FREQUENCIES.monthly,
          dayOfMonth: currentDay,
          settings: {},
          isEnabled: true,
        }),
        raw: true,
      });

      const result = await checkScheduledReminders();

      expect(result.triggered).toBeGreaterThan(0);
    });
  });

  describe('checkRealTimeReminders', () => {
    it('triggers notification for real-time reminder when threshold exceeded', async () => {
      const account = await helpers.createAccount({ raw: true });
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Real-time Trigger Test' }),
        raw: true,
      });

      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 600, // More than threshold
          transactionType: TRANSACTION_TYPES.expense,
          time: new Date().toISOString(),
        }),
        raw: true,
      });

      await helpers.addTransactionsToTag({
        tagId: tag.id,
        transactionIds: [tx.id],
        raw: true,
      });

      const reminder = await helpers.createTagReminder({
        tagId: tag.id,
        payload: helpers.buildRealTimeReminderPayload({
          type: TAG_REMINDER_TYPES.amountThreshold,
          settings: { amountThreshold: 500 },
          isEnabled: true,
        }),
        raw: true,
      });

      const dbReminder = await TagReminders.findByPk(reminder.id);
      const result = await checkRealTimeReminders({ reminders: [dbReminder!] });

      expect(result.triggered).toBeGreaterThan(0);
    });

    it('respects 24h cooldown', async () => {
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Cooldown Test' }),
        raw: true,
      });

      const reminder = await helpers.createTagReminder({
        tagId: tag.id,
        payload: helpers.buildRealTimeReminderPayload({
          type: TAG_REMINDER_TYPES.existenceCheck,
          settings: {},
          isEnabled: true,
        }),
        raw: true,
      });

      // Set lastTriggeredAt to recent (within 24h)
      await TagReminders.update({ lastTriggeredAt: new Date() }, { where: { id: reminder.id } });

      const dbReminder = await TagReminders.findByPk(reminder.id);
      const result = await checkRealTimeReminders({ reminders: [dbReminder!] });

      expect(result.skipped).toBeGreaterThan(0);
    });
  });

  describe('checkScheduledReminders - disabled reminders', () => {
    it('skips disabled reminders', async () => {
      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Disabled Reminder Test' }),
        raw: true,
      });

      const today = new Date();
      const currentDay = today.getDate();

      await helpers.createTagReminder({
        tagId: tag.id,
        payload: helpers.buildTagReminderPayload({
          type: TAG_REMINDER_TYPES.existenceCheck,
          frequency: TAG_REMINDER_FREQUENCIES.monthly,
          dayOfMonth: currentDay,
          isEnabled: false, // Disabled
        }),
        raw: true,
      });

      const result = await checkScheduledReminders();

      // Disabled reminder should not be in the checked count
      const checkedTagNames = result.results.map((r) => r.tagName);
      expect(checkedTagNames).not.toContain('Disabled Reminder Test');
    });
  });
});
