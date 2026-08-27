import { NOTIFICATION_PRIORITIES, NOTIFICATION_STATUSES, NOTIFICATION_TYPES } from '@bt/shared/types';
import { beforeEach, describe, expect, it } from '@jest/globals';
import Notifications from '@models/notifications.model';
import Users from '@models/users.model';
import * as helpers from '@tests/helpers';

describe('Notifications API', () => {
  let testUserId: number;

  beforeEach(async () => {
    // Get the test user ID (created in setupIntegrationTests.ts)
    const user = await Users.findOne({ where: { username: 'test1' } });
    testUserId = user!.id;
  });

  describe('GET /notifications', () => {
    it('returns empty array and zero unread count when no notifications exist', async () => {
      const notifications = await helpers.getNotifications({ raw: true });

      expect(notifications).toEqual([]);

      const unreadCount = await helpers.getUnreadCount({ raw: true });

      expect(unreadCount.count).toBe(0);
    });

    it('returns notifications for the authenticated user', async () => {
      await Notifications.bulkCreate(
        [
          {
            userId: testUserId,
            type: NOTIFICATION_TYPES.budgetAlert,
            title: 'Budget Alert 1',
            message: 'You exceeded your budget',
            priority: NOTIFICATION_PRIORITIES.high,
          },
          {
            userId: testUserId,
            type: NOTIFICATION_TYPES.system,
            title: 'System Notification',
            priority: NOTIFICATION_PRIORITIES.normal,
          },
        ],
        { individualHooks: true },
      );

      const notifications = await helpers.getNotifications({ raw: true });

      expect(notifications).toHaveLength(2);
      expect(notifications[0]).toMatchObject({
        type: expect.any(String),
        title: expect.any(String),
        status: NOTIFICATION_STATUSES.unread,
      });
      // Should not include userId in response
      expect(notifications[0]).not.toHaveProperty('userId');
    });

    it('filters by status and type, excluding dismissed unless explicitly requested', async () => {
      await Notifications.bulkCreate(
        [
          {
            userId: testUserId,
            type: NOTIFICATION_TYPES.budgetAlert,
            title: 'Unread notification',
            status: NOTIFICATION_STATUSES.unread,
          },
          {
            userId: testUserId,
            type: NOTIFICATION_TYPES.budgetAlert,
            title: 'Read notification',
            status: NOTIFICATION_STATUSES.read,
            readAt: new Date(),
          },
          {
            userId: testUserId,
            type: NOTIFICATION_TYPES.budgetAlert,
            title: 'Dismissed notification',
            status: NOTIFICATION_STATUSES.dismissed,
          },
          {
            userId: testUserId,
            type: NOTIFICATION_TYPES.system,
            title: 'System Alert',
            status: NOTIFICATION_STATUSES.unread,
          },
        ],
        { individualHooks: true },
      );

      const titlesOf = (notifications: { title: string }[]) => notifications.map((n) => n.title).sort();

      expect(titlesOf(await helpers.getNotifications({ raw: true }))).toEqual([
        'Read notification',
        'System Alert',
        'Unread notification',
      ]);

      expect(
        titlesOf(
          await helpers.getNotifications({
            status: NOTIFICATION_STATUSES.unread,
            raw: true,
          }),
        ),
      ).toEqual(['System Alert', 'Unread notification']);

      expect(
        titlesOf(
          await helpers.getNotifications({
            type: NOTIFICATION_TYPES.budgetAlert,
            raw: true,
          }),
        ),
      ).toEqual(['Read notification', 'Unread notification']);

      expect(
        titlesOf(
          await helpers.getNotifications({
            status: NOTIFICATION_STATUSES.dismissed,
            raw: true,
          }),
        ),
      ).toEqual(['Dismissed notification']);
    });

    it('supports pagination with limit and offset', async () => {
      // Create 5 notifications
      await Notifications.bulkCreate(
        Array.from({ length: 5 }, (_, i) => ({
          userId: testUserId,
          type: NOTIFICATION_TYPES.system,
          title: `Notification ${i + 1}`,
        })),
        { individualHooks: true },
      );

      const firstPage = await helpers.getNotifications({ limit: 2, offset: 0, raw: true });
      const secondPage = await helpers.getNotifications({ limit: 2, offset: 2, raw: true });

      expect(firstPage).toHaveLength(2);
      expect(secondPage).toHaveLength(2);
      // Different notifications on each page
      expect(firstPage[0]!.id).not.toBe(secondPage[0]!.id);
    });

    it('returns notifications ordered by createdAt descending (newest first)', async () => {
      const now = new Date();
      const older = new Date(now.getTime() - 60000);
      const oldest = new Date(now.getTime() - 120000);

      await Notifications.bulkCreate(
        [
          {
            userId: testUserId,
            type: NOTIFICATION_TYPES.system,
            title: 'Oldest',
            createdAt: oldest,
          },
          {
            userId: testUserId,
            type: NOTIFICATION_TYPES.system,
            title: 'Newest',
            createdAt: now,
          },
          {
            userId: testUserId,
            type: NOTIFICATION_TYPES.system,
            title: 'Middle',
            createdAt: older,
          },
        ],
        { individualHooks: true },
      );

      const notifications = await helpers.getNotifications({ raw: true });

      expect(notifications[0]!.title).toBe('Newest');
      expect(notifications[1]!.title).toBe('Middle');
      expect(notifications[2]!.title).toBe('Oldest');
    });
  });

  describe('GET /notifications/:id', () => {
    it('returns a specific notification by ID', async () => {
      const notification = await Notifications.create({
        userId: testUserId,
        type: NOTIFICATION_TYPES.budgetAlert,
        title: 'Specific notification',
        message: 'Details here',
        payload: { budgetId: 123 },
      });

      const result = await helpers.getNotificationById({ id: notification.id, raw: true });

      expect(result).toMatchObject({
        id: notification.id,
        title: 'Specific notification',
        message: 'Details here',
        payload: { budgetId: 123 },
      });
      expect(result).not.toHaveProperty('userId');
    });
  });

  describe('GET /notifications/unread-count', () => {
    it('returns count of unread notifications only', async () => {
      await Notifications.bulkCreate(
        [
          {
            userId: testUserId,
            type: NOTIFICATION_TYPES.budgetAlert,
            title: 'Unread 1',
            status: NOTIFICATION_STATUSES.unread,
          },
          {
            userId: testUserId,
            type: NOTIFICATION_TYPES.budgetAlert,
            title: 'Unread 2',
            status: NOTIFICATION_STATUSES.unread,
          },
          {
            userId: testUserId,
            type: NOTIFICATION_TYPES.budgetAlert,
            title: 'Read',
            status: NOTIFICATION_STATUSES.read,
            readAt: new Date(),
          },
          {
            userId: testUserId,
            type: NOTIFICATION_TYPES.budgetAlert,
            title: 'Dismissed',
            status: NOTIFICATION_STATUSES.dismissed,
          },
        ],
        { individualHooks: true },
      );

      const result = await helpers.getUnreadCount({ raw: true });

      expect(result.count).toBe(2);
    });
  });

  describe('POST /notifications/:id/read', () => {
    it('marks a notification as read', async () => {
      const notification = await Notifications.create({
        userId: testUserId,
        type: NOTIFICATION_TYPES.budgetAlert,
        title: 'To be read',
        status: NOTIFICATION_STATUSES.unread,
      });

      const result = await helpers.markAsRead({ id: notification.id, raw: true });

      expect(result.success).toBe(true);

      // Verify in database
      const updated = await Notifications.findByPk(notification.id);
      expect(updated!.status).toBe(NOTIFICATION_STATUSES.read);
      expect(updated!.readAt).not.toBeNull();
    });

    it('returns success even when notification is already read', async () => {
      const notification = await Notifications.create({
        userId: testUserId,
        type: NOTIFICATION_TYPES.budgetAlert,
        title: 'Already read',
        status: NOTIFICATION_STATUSES.read,
        readAt: new Date(),
      });

      const result = await helpers.markAsRead({ id: notification.id, raw: true });

      expect(result.success).toBe(true);
    });
  });

  describe('POST /notifications/read-all', () => {
    it('marks all unread notifications as read', async () => {
      await Notifications.bulkCreate(
        [
          {
            userId: testUserId,
            type: NOTIFICATION_TYPES.budgetAlert,
            title: 'Unread 1',
            status: NOTIFICATION_STATUSES.unread,
          },
          {
            userId: testUserId,
            type: NOTIFICATION_TYPES.budgetAlert,
            title: 'Unread 2',
            status: NOTIFICATION_STATUSES.unread,
          },
          {
            userId: testUserId,
            type: NOTIFICATION_TYPES.budgetAlert,
            title: 'Already read',
            status: NOTIFICATION_STATUSES.read,
            readAt: new Date(),
          },
        ],
        { individualHooks: true },
      );

      const result = await helpers.markAllAsRead({ raw: true });

      expect(result.updated).toBe(2);

      // Verify all are now read
      const unreadCount = await Notifications.count({
        where: { userId: testUserId, status: NOTIFICATION_STATUSES.unread },
      });
      expect(unreadCount).toBe(0);
    });

    it('returns 0 when no unread notifications exist', async () => {
      await Notifications.create({
        userId: testUserId,
        type: NOTIFICATION_TYPES.budgetAlert,
        title: 'Already read',
        status: NOTIFICATION_STATUSES.read,
        readAt: new Date(),
      });

      const result = await helpers.markAllAsRead({ raw: true });

      expect(result.updated).toBe(0);
    });
  });

  describe('POST /notifications/:id/dismiss', () => {
    it('dismisses a notification, removing it from the default list and the unread count', async () => {
      const notification = await Notifications.create({
        userId: testUserId,
        type: NOTIFICATION_TYPES.budgetAlert,
        title: 'To be dismissed',
        status: NOTIFICATION_STATUSES.unread,
      });

      expect(await helpers.getNotifications({ raw: true })).toHaveLength(1);
      expect((await helpers.getUnreadCount({ raw: true })).count).toBe(1);

      const result = await helpers.dismissNotification({ id: notification.id, raw: true });

      expect(result.success).toBe(true);

      // Verify in database
      const updated = await Notifications.findByPk(notification.id);
      expect(updated!.status).toBe(NOTIFICATION_STATUSES.dismissed);

      expect(await helpers.getNotifications({ raw: true })).toHaveLength(0);
      expect((await helpers.getUnreadCount({ raw: true })).count).toBe(0);
    });

    it('can dismiss a read notification', async () => {
      const notification = await Notifications.create({
        userId: testUserId,
        type: NOTIFICATION_TYPES.budgetAlert,
        title: 'Read notification',
        status: NOTIFICATION_STATUSES.read,
        readAt: new Date(),
      });

      const result = await helpers.dismissNotification({ id: notification.id, raw: true });

      expect(result.success).toBe(true);

      const updated = await Notifications.findByPk(notification.id);
      expect(updated!.status).toBe(NOTIFICATION_STATUSES.dismissed);
    });
  });

  describe('non-existent notification id', () => {
    it('returns null from get-by-id and false from read/dismiss', async () => {
      // Create a valid notification first, then use a different valid UUID that doesn't exist
      const notification = await Notifications.create({
        userId: testUserId,
        type: NOTIFICATION_TYPES.budgetAlert,
        title: 'Test',
      });
      const existingId = notification.id;
      const nonExistentId = existingId.replace(/.$/, existingId.endsWith('0') ? '1' : '0');

      expect(await helpers.getNotificationById({ id: nonExistentId, raw: true })).toBeNull();
      expect((await helpers.markAsRead({ id: nonExistentId, raw: true })).success).toBe(false);
      expect((await helpers.dismissNotification({ id: nonExistentId, raw: true })).success).toBe(false);
    });
  });

  describe('notification payload and metadata', () => {
    it('includes all expected fields in response and preserves payload data', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 86400000); // +1 day
      const payload = { budgetId: 42, threshold: 90, currentSpending: 950 };

      await Notifications.create({
        userId: testUserId,
        type: NOTIFICATION_TYPES.changelog,
        title: 'New feature',
        message: 'We added dark mode!',
        priority: NOTIFICATION_PRIORITIES.low,
        expiresAt,
        payload,
      });

      const notifications = await helpers.getNotifications({ raw: true });
      const notification = notifications[0]!;

      expect(notification).toHaveProperty('id');
      expect(notification).toHaveProperty('type', NOTIFICATION_TYPES.changelog);
      expect(notification).toHaveProperty('title', 'New feature');
      expect(notification).toHaveProperty('message', 'We added dark mode!');
      expect(notification).toHaveProperty('payload');
      expect(notification.payload).toEqual(payload);
      expect(notification).toHaveProperty('status', NOTIFICATION_STATUSES.unread);
      expect(notification).toHaveProperty('priority', NOTIFICATION_PRIORITIES.low);
      expect(notification).toHaveProperty('createdAt');
      expect(notification).toHaveProperty('readAt');
      expect(notification).toHaveProperty('expiresAt');
      // Should NOT have userId
      expect(notification).not.toHaveProperty('userId');
    });
  });
});
