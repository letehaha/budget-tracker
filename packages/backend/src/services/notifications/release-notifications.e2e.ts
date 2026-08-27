import { NOTIFICATION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import Notifications from '@models/notifications.model';
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

    it('skips notification for [chore] (any casing), draft and prerelease releases', async () => {
      const expectNoChangelogNotifications = async () => {
        const notifications = await Notifications.findAll({
          where: { type: NOTIFICATION_TYPES.changelog },
        });

        expect(notifications).toHaveLength(0);
      };

      const choreResponse = await helpers.sendGitHubWebhook({
        payload: helpers.createReleasePayload({
          tagName: 'v1.0.1',
          name: '[chore] v1.0.1 - Internal refactoring',
        }),
      });

      expect(choreResponse.status).toBe(200);
      expect(choreResponse.body.message).toBe('Chore release skipped');
      await expectNoChangelogNotifications();

      const upperCaseChoreResponse = await helpers.sendGitHubWebhook({
        payload: helpers.createReleasePayload({
          tagName: 'v1.0.6',
          name: '[CHORE] v1.0.6 - Cleanup',
        }),
      });

      expect(upperCaseChoreResponse.status).toBe(200);
      expect(upperCaseChoreResponse.body.message).toBe('Chore release skipped');
      await expectNoChangelogNotifications();

      const draftResponse = await helpers.sendGitHubWebhook({
        payload: helpers.createReleasePayload({
          tagName: 'v1.0.2',
          name: 'v1.0.2',
          draft: true,
        }),
      });

      expect(draftResponse.status).toBe(200);
      expect(draftResponse.body.message).toBe('Draft/prerelease ignored');
      await expectNoChangelogNotifications();

      const prereleaseResponse = await helpers.sendGitHubWebhook({
        payload: helpers.createReleasePayload({
          tagName: 'v1.0.3-beta',
          name: 'v1.0.3 Beta',
          prerelease: true,
        }),
      });

      expect(prereleaseResponse.status).toBe(200);
      expect(prereleaseResponse.body.message).toBe('Draft/prerelease ignored');
      await expectNoChangelogNotifications();
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

    it('ignores non-published actions and non-release events, answers pings and rejects invalid signatures', async () => {
      const nonPublishedResponse = await helpers.sendGitHubWebhook({
        payload: helpers.createReleasePayload({
          tagName: 'v1.0.4',
          name: 'v1.0.4',
          action: 'created',
        }),
      });

      expect(nonPublishedResponse.status).toBe(200);
      expect(nonPublishedResponse.body.message).toBe('Action ignored');

      const notifications = await Notifications.findAll({
        where: { type: NOTIFICATION_TYPES.changelog },
      });

      expect(notifications).toHaveLength(0);

      const pingResponse = await helpers.sendGitHubWebhook({
        payload: helpers.createReleasePayload(),
        event: 'ping',
      });

      expect(pingResponse.status).toBe(200);
      expect(pingResponse.body.message).toBe('pong');

      const pushResponse = await helpers.sendGitHubWebhook({
        payload: helpers.createReleasePayload(),
        event: 'push',
      });

      expect(pushResponse.status).toBe(200);
      expect(pushResponse.body.message).toBe('Event ignored');

      const invalidSignatureResponse = await helpers.sendGitHubWebhook({
        payload: helpers.createReleasePayload({
          tagName: 'v1.0.5',
          name: 'v1.0.5',
        }),
        secret: 'wrong-secret',
      });

      expect(invalidSignatureResponse.status).toBe(401);
      expect(invalidSignatureResponse.body.error).toBe('Invalid signature');
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
