import { NOTIFICATION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import Notifications from '@models/Notifications.model';
import * as helpers from '@tests/helpers';

describe('Release Notifications Webhook', () => {
  describe('POST /webhooks/github', () => {
    it('creates notifications for active users on valid release', async () => {
      const payload = helpers.createReleasePayload({
        tagName: 'v1.0.0',
        name: 'Release v1.0.0 - New features',
      });

      const response = await helpers.sendGitHubWebhook({ payload });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        message: 'Release notification created',
        version: 'v1.0.0',
        notifiedUsers: 1, // test user from setup
      });

      // Verify notification was created
      const notifications = await Notifications.findAll({
        where: { type: NOTIFICATION_TYPES.changelog },
      });

      expect(notifications).toHaveLength(1);
      expect(notifications[0]!.title).toBe('New version v1.0.0');
      expect(notifications[0]!.message).toBeNull();
      expect(notifications[0]!.payload).toMatchObject({
        version: 'v1.0.0',
        releaseName: 'Release v1.0.0 - New features',
        releaseUrl: 'https://github.com/test/repo/releases/tag/v1.0.0',
      });
    });

    it('skips notification for [chore] prefixed releases', async () => {
      const payload = helpers.createReleasePayload({
        tagName: 'v1.0.1',
        name: '[chore] v1.0.1 - Internal refactoring',
      });

      const response = await helpers.sendGitHubWebhook({ payload });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Chore release skipped');

      // Verify no notification was created
      const notifications = await Notifications.findAll({
        where: { type: NOTIFICATION_TYPES.changelog },
      });

      expect(notifications).toHaveLength(0);
    });

    it('skips notification for draft releases', async () => {
      const payload = helpers.createReleasePayload({
        tagName: 'v1.0.2',
        name: 'v1.0.2',
        draft: true,
      });

      const response = await helpers.sendGitHubWebhook({ payload });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Draft/prerelease ignored');

      const notifications = await Notifications.findAll({
        where: { type: NOTIFICATION_TYPES.changelog },
      });

      expect(notifications).toHaveLength(0);
    });

    it('skips notification for prereleases', async () => {
      const payload = helpers.createReleasePayload({
        tagName: 'v1.0.3-beta',
        name: 'v1.0.3 Beta',
        prerelease: true,
      });

      const response = await helpers.sendGitHubWebhook({ payload });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Draft/prerelease ignored');

      const notifications = await Notifications.findAll({
        where: { type: NOTIFICATION_TYPES.changelog },
      });

      expect(notifications).toHaveLength(0);
    });

    it('skips duplicate notifications for the same version', async () => {
      const payload = helpers.createReleasePayload({
        tagName: 'v2.0.0',
        name: 'v2.0.0 - Major update',
      });

      // First webhook call
      const response1 = await helpers.sendGitHubWebhook({ payload });
      expect(response1.status).toBe(200);
      expect(response1.body.notifiedUsers).toBe(1);

      // Second webhook call (duplicate)
      const response2 = await helpers.sendGitHubWebhook({ payload });
      expect(response2.status).toBe(200);
      expect(response2.body.notifiedUsers).toBe(0);

      // Should still only have 1 notification
      const notifications = await Notifications.findAll({
        where: { type: NOTIFICATION_TYPES.changelog },
      });

      expect(notifications).toHaveLength(1);
    });

    it('ignores non-published actions', async () => {
      const payload = helpers.createReleasePayload({
        tagName: 'v1.0.4',
        name: 'v1.0.4',
        action: 'created',
      });

      const response = await helpers.sendGitHubWebhook({ payload });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Action ignored');

      const notifications = await Notifications.findAll({
        where: { type: NOTIFICATION_TYPES.changelog },
      });

      expect(notifications).toHaveLength(0);
    });

    it('rejects requests with invalid signature', async () => {
      const payload = helpers.createReleasePayload({
        tagName: 'v1.0.5',
        name: 'v1.0.5',
      });

      const response = await helpers.sendGitHubWebhook({
        payload,
        secret: 'wrong-secret',
      });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid signature');
    });

    it('responds to ping events', async () => {
      const payload = helpers.createReleasePayload();

      const response = await helpers.sendGitHubWebhook({
        payload,
        event: 'ping',
      });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('pong');
    });

    it('ignores non-release events', async () => {
      const payload = helpers.createReleasePayload();

      const response = await helpers.sendGitHubWebhook({
        payload,
        event: 'push',
      });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Event ignored');
    });

    it('handles case-insensitive [chore] prefix', async () => {
      const payload = helpers.createReleasePayload({
        tagName: 'v1.0.6',
        name: '[CHORE] v1.0.6 - Cleanup',
      });

      const response = await helpers.sendGitHubWebhook({ payload });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Chore release skipped');
    });

    it('uses tag_name when release name is null', async () => {
      const payload = helpers.createReleasePayload({
        tagName: 'v3.0.0',
        name: null,
      });

      const response = await helpers.sendGitHubWebhook({ payload });

      expect(response.status).toBe(200);
      expect(response.body.notifiedUsers).toBe(1);

      const notifications = await Notifications.findAll({
        where: { type: NOTIFICATION_TYPES.changelog },
      });

      expect(notifications).toHaveLength(1);
      expect(notifications[0]!.title).toBe('New version v3.0.0');
      expect(notifications[0]!.message).toBeNull();
      expect(notifications[0]!.payload).toMatchObject({
        version: 'v3.0.0',
        releaseName: 'v3.0.0', // Falls back to tag_name
        releaseUrl: 'https://github.com/test/repo/releases/tag/v3.0.0',
      });
    });
  });
});
