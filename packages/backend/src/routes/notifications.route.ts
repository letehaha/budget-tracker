import {
  createNotification,
  dismissNotification,
  getNotificationById,
  getNotifications,
  getUnreadCount,
  markAllAsRead,
  markAsRead,
} from '@controllers/notifications.controller';
import { authenticateSession } from '@middlewares/better-auth';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

// Get all notifications for the authenticated user
router.get('/', authenticateSession, validateEndpoint(getNotifications.schema), getNotifications.handler);

// Get unread count
router.get('/unread-count', authenticateSession, validateEndpoint(getUnreadCount.schema), getUnreadCount.handler);

// Get a specific notification
router.get('/:id', authenticateSession, validateEndpoint(getNotificationById.schema), getNotificationById.handler);

// Create a notification (primarily for internal/admin use, but exposed for testing)
router.post('/', authenticateSession, validateEndpoint(createNotification.schema), createNotification.handler);

// Mark a specific notification as read
router.post('/:id/read', authenticateSession, validateEndpoint(markAsRead.schema), markAsRead.handler);

// Mark all notifications as read
router.post('/read-all', authenticateSession, validateEndpoint(markAllAsRead.schema), markAllAsRead.handler);

// Dismiss a notification
router.post(
  '/:id/dismiss',
  authenticateSession,
  validateEndpoint(dismissNotification.schema),
  dismissNotification.handler,
);

export default router;
