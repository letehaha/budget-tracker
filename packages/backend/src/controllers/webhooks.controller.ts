import { logger } from '@js/utils/logger';
import { createReleaseNotifications } from '@services/notifications/release-notifications';
import { Request, Response } from 'express';

/**
 * GitHub release webhook payload structure (subset of fields we care about)
 * @see https://docs.github.com/en/webhooks/webhook-events-and-payloads#release
 */
interface GitHubReleaseWebhookPayload {
  action: 'published' | 'unpublished' | 'created' | 'edited' | 'deleted' | 'prereleased' | 'released';
  release: {
    tag_name: string;
    name: string | null;
    body: string | null;
    html_url: string;
    draft: boolean;
    prerelease: boolean;
    published_at: string | null;
    created_at: string;
  };
  repository: {
    full_name: string;
  };
}

const SKIP_NOTIFICATION_PREFIX = '[chore]';

/**
 * Handles GitHub release webhook events.
 * Creates notifications for users when a new release is published.
 */
async function handleGitHubRelease(req: Request, res: Response): Promise<void> {
  const event = req.headers['x-github-event'] as string;

  // Only handle release events
  if (event !== 'release') {
    logger.info(`Ignoring GitHub webhook event: ${event}`);
    res.status(200).json({ message: 'Event ignored' });
    return;
  }

  const payload = req.body as unknown as GitHubReleaseWebhookPayload;

  // Only notify on 'published' action (not draft, not pre-release)
  if (payload.action !== 'published') {
    logger.info(`Ignoring release action: ${payload.action}`);
    res.status(200).json({ message: 'Action ignored' });
    return;
  }

  // Skip drafts and pre-releases
  if (payload.release.draft || payload.release.prerelease) {
    logger.info('Ignoring draft or pre-release');
    res.status(200).json({ message: 'Draft/prerelease ignored' });
    return;
  }

  const releaseName = payload.release.name || payload.release.tag_name;

  // Skip releases with [chore] prefix
  if (releaseName.toLowerCase().startsWith(SKIP_NOTIFICATION_PREFIX)) {
    logger.info(`Skipping notification for chore release: ${releaseName}`);
    res.status(200).json({ message: 'Chore release skipped' });
    return;
  }

  try {
    const notifiedCount = await createReleaseNotifications({
      version: payload.release.tag_name,
      releaseName,
      releaseUrl: payload.release.html_url,
      releaseDate: payload.release.published_at || payload.release.created_at,
    });

    logger.info(`GitHub release webhook processed: ${payload.release.tag_name}, notified ${notifiedCount} users`);

    res.status(200).json({
      message: 'Release notification created',
      version: payload.release.tag_name,
      notifiedUsers: notifiedCount,
    });
  } catch (error) {
    logger.error({ message: 'Failed to process GitHub release webhook', error: error as Error });
    res.status(500).json({ error: 'Failed to process webhook' });
  }
}

/**
 * Main GitHub webhook handler. Handles ping and release events.
 */
export async function handleGitHubWebhook(req: Request, res: Response): Promise<void> {
  const event = req.headers['x-github-event'] as string;

  // Handle ping event (sent when webhook is first configured)
  if (event === 'ping') {
    logger.info('GitHub webhook ping received');
    res.status(200).json({ message: 'pong' });
    return;
  }

  // For release events, delegate to release handler
  await handleGitHubRelease(req, res);
}
