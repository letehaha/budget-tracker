import { logger } from '@js/utils';
import { expireOverdueInvitations } from '@services/sharing/invitations/expire-invitations.service';
import { CronJob } from 'cron';

/**
 * Daily sweep that flips `pending` ShareInvitations rows past their `expiresAt` to
 * `expired` and emits a `share_expired` notification to each owner. Mirrors the
 * tag-reminders / payment-reminders cron shape so ops surface (start/stop, manual trigger
 * for tests) is consistent across cron services.
 */
class ShareInvitationsExpireCronService {
  private job: CronJob | null = null;

  /**
   * Schedule: 03:15 UTC daily. Avoids the on-the-hour spike that hits Resend / DB at the
   * top of every hour with the other crons.
   */
  public startCron(): void {
    if (this.job) {
      logger.info('Share invitations expire cron is already running');
      return;
    }

    this.job = new CronJob(
      '15 3 * * *',
      async () => {
        try {
          logger.info('Starting scheduled share-invitations expire sweep');
          const result = await expireOverdueInvitations();
          logger.info('Share-invitations expire sweep completed', {
            expired: result.expiredCount,
            notified: result.notifiedCount,
          });
        } catch (error) {
          // Stable code so Sentry groups by failure mode, not by stack-trace fingerprint.
          logger.error(
            {
              message: 'Scheduled share-invitations expire sweep failed',
              error: error as Error,
            },
            { code: 'SHARE_INVITATIONS_EXPIRE_CRON_FAILED' },
          );
        }
      },
      null,
      false,
      'UTC',
    );

    this.job.start();
    logger.info('Share invitations expire cron started — runs daily at 03:15 UTC');
  }

  public stopCron(): void {
    if (this.job) {
      this.job.stop();
      this.job = null;
      logger.info('Share invitations expire cron stopped');
    }
  }

  public isRunning(): boolean {
    return this.job !== null;
  }

  /** Manual trigger — used by tests instead of waiting on the schedule. */
  public async triggerManualCheck(): Promise<void> {
    try {
      logger.info('Starting manual share-invitations expire sweep');
      const result = await expireOverdueInvitations();
      logger.info('Manual share-invitations expire sweep completed', {
        expired: result.expiredCount,
        notified: result.notifiedCount,
      });
    } catch (error) {
      logger.error(
        {
          message: 'Manual share-invitations expire sweep failed',
          error: error as Error,
        },
        { code: 'SHARE_INVITATIONS_EXPIRE_CRON_MANUAL_FAILED' },
      );
      throw error;
    }
  }
}

export const shareInvitationsExpireCron = new ShareInvitationsExpireCronService();
