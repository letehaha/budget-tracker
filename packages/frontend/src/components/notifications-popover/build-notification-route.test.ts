import type { NotificationStruct } from '@/api/notifications';
import { ROUTES_NAMES } from '@/routes/constants';
import { NOTIFICATION_STATUSES, NOTIFICATION_TYPES, RESOURCE_TYPES } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import { buildNotificationRoute } from './build-notification-route';

const baseNotification = (overrides: Partial<NotificationStruct>): NotificationStruct =>
  ({
    id: 'n1',
    type: NOTIFICATION_TYPES.system,
    status: NOTIFICATION_STATUSES.unread,
    title: 'title',
    body: 'body',
    payload: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    readAt: null,
    dismissedAt: null,
    ...overrides,
  }) as NotificationStruct;

describe('buildNotificationRoute', () => {
  describe('share_invitation_received', () => {
    it('returns SPA route to accounts with invitation_token query when token present', () => {
      const route = buildNotificationRoute(
        baseNotification({
          type: NOTIFICATION_TYPES.shareInvitationReceived,
          payload: {
            invitationId: 'inv-1',
            token: 'tok-abc',
            resourceType: RESOURCE_TYPES.account,
            resourceId: '42',
            resourceName: 'Wallet',
            permission: 'write',
            owner: { id: 1, username: 'alice', avatar: null },
          },
        }),
      );

      expect(route).toEqual({
        kind: 'spa',
        to: { name: ROUTES_NAMES.accounts, query: { invitation_token: 'tok-abc' } },
      });
    });

    it('returns null when payload is missing token', () => {
      const route = buildNotificationRoute(
        baseNotification({
          type: NOTIFICATION_TYPES.shareInvitationReceived,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          payload: { invitationId: 'inv-1' } as any,
        }),
      );

      expect(route).toBeNull();
    });
  });

  describe('share_accepted', () => {
    it('returns SPA route to account with numeric id when resourceType=account', () => {
      const route = buildNotificationRoute(
        baseNotification({
          type: NOTIFICATION_TYPES.shareAccepted,
          payload: {
            resourceType: RESOURCE_TYPES.account,
            resourceId: '99',
            resourceName: 'Joint',
            counterpartUser: { id: 2, username: 'bob', avatar: null },
          },
        }),
      );

      expect(route).toEqual({
        kind: 'spa',
        to: { name: ROUTES_NAMES.account, params: { id: 99 } },
      });
    });

    it('returns null when resourceId is not a valid integer', () => {
      const route = buildNotificationRoute(
        baseNotification({
          type: NOTIFICATION_TYPES.shareAccepted,
          payload: {
            resourceType: RESOURCE_TYPES.account,
            resourceId: 'not-a-number',
            resourceName: 'Joint',
            counterpartUser: { id: 2, username: 'bob', avatar: null },
          },
        }),
      );

      expect(route).toBeNull();
    });

    it('returns null when resourceType is not account (no router target yet)', () => {
      // Phase 1 only ships RESOURCE_TYPES.account; later phases add budget/portfolio/etc.
      // Use a string cast so this test stays meaningful as soon as a second resource type
      // is added — at that point flip this to the new value.
      const route = buildNotificationRoute(
        baseNotification({
          type: NOTIFICATION_TYPES.shareAccepted,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          payload: {
            resourceType: 'budget' as any,
            resourceId: '5',
            resourceName: 'Groceries',
            counterpartUser: { id: 2, username: 'bob', avatar: null },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        }),
      );

      expect(route).toBeNull();
    });
  });

  describe('budget_alert', () => {
    it('returns SPA route to planned budget details when budgetId present', () => {
      const route = buildNotificationRoute(
        baseNotification({
          type: NOTIFICATION_TYPES.budgetAlert,
          payload: { budgetId: 7 },
        }),
      );

      expect(route).toEqual({
        kind: 'spa',
        to: { name: ROUTES_NAMES.plannedBudgetDetails, params: { id: 7 } },
      });
    });

    it('falls back to planned budgets list when budgetId is missing', () => {
      const route = buildNotificationRoute(
        baseNotification({
          type: NOTIFICATION_TYPES.budgetAlert,
          payload: {},
        }),
      );

      expect(route).toEqual({
        kind: 'spa',
        to: { name: ROUTES_NAMES.plannedBudgets },
      });
    });
  });

  describe('non-actionable types', () => {
    it.each([
      NOTIFICATION_TYPES.system,
      NOTIFICATION_TYPES.changelog,
      NOTIFICATION_TYPES.tagReminder,
      NOTIFICATION_TYPES.paymentReminder,
      NOTIFICATION_TYPES.shareDeclined,
      NOTIFICATION_TYPES.shareRevoked,
      NOTIFICATION_TYPES.shareLeft,
      NOTIFICATION_TYPES.shareExpired,
      NOTIFICATION_TYPES.shareOwnerAccountDeleted,
    ])('returns null for type "%s"', (type) => {
      const route = buildNotificationRoute(baseNotification({ type, payload: {} }));
      expect(route).toBeNull();
    });
  });
});
