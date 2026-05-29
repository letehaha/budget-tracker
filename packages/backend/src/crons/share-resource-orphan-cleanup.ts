import { logger } from '@js/utils';
import { cleanupOrphanShares } from '@services/sharing/cleanup/cleanup-orphan-shares.service';
import { CronJob } from 'cron';

/**
 * Daily safety-net sweep that removes `ResourceShares` and `ShareInvitations` whose
 * referenced resource (e.g. an `Accounts` row) no longer exists. The primary cleanup path
 * is `cleanupAccountSharesInTx` inside the account-delete service; this cron exists to
 * catch corner cases — direct DB deletes, future cascades that bypass the hook, or any
 * code path that drops shareable resources without going through the service layer.
 *
 * Schedule: 03:30 UTC daily. Staggered 15 minutes after the share-invitations expire
 * cron (03:15) so the two share-related sweeps don't compete for the same DB connections.
 */
class ShareResourceOrphanCleanupCronService {
  private job: CronJob | null = null;

  public startCron(): void {
    if (this.job) {
      logger.info('Share resource orphan cleanup cron is already running');
      return;
    }

    this.job = new CronJob(
      '30 3 * * *',
      async () => {
        try {
          logger.info('Starting scheduled share-resource orphan cleanup');
          const result = await cleanupOrphanShares();
          logger.info('Share-resource orphan cleanup completed', {
            shares: result.deletedSharesCount,
            invitations: result.deletedInvitationsCount,
          });
        } catch (error) {
          // Stable code so Sentry groups by failure mode, not by stack-trace fingerprint.
          logger.error(
            {
              message: 'Scheduled share-resource orphan cleanup failed',
              error: error as Error,
            },
            { code: 'SHARE_RESOURCE_ORPHAN_CLEANUP_CRON_FAILED' },
          );
        }
      },
      null,
      false,
      'UTC',
    );

    this.job.start();
    logger.info('Share resource orphan cleanup cron started — runs daily at 03:30 UTC');
  }

  public stopCron(): void {
    if (this.job) {
      this.job.stop();
      this.job = null;
      logger.info('Share resource orphan cleanup cron stopped');
    }
  }

  public isRunning(): boolean {
    return this.job !== null;
  }

  /** Manual trigger — used by tests instead of waiting on the schedule. */
  public async triggerManualCheck(): Promise<void> {
    try {
      logger.info('Starting manual share-resource orphan cleanup');
      const result = await cleanupOrphanShares();
      logger.info('Manual share-resource orphan cleanup completed', {
        shares: result.deletedSharesCount,
        invitations: result.deletedInvitationsCount,
      });
    } catch (error) {
      logger.error(
        {
          message: 'Manual share-resource orphan cleanup failed',
          error: error as Error,
        },
        { code: 'SHARE_RESOURCE_ORPHAN_CLEANUP_CRON_MANUAL_FAILED' },
      );
      throw error;
    }
  }
}

export const shareResourceOrphanCleanupCron = new ShareResourceOrphanCleanupCronService();
