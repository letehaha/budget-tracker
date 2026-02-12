import { logger } from '@js/utils';
import Users from '@models/Users.model';
import { runDetection } from '@services/subscriptions/detect-candidates';
import { CronJob } from 'cron';

class SubscriptionCandidateDetectionCronService {
  private job: CronJob | null = null;

  /**
   * Starts the subscription candidate detection cron job.
   * Runs on the 1st of every month at 3:00 AM UTC.
   * Pattern: '0 3 1 * *'
   */
  public startCron(): void {
    if (this.job) {
      logger.info('subscription candidate detection cron job is already running');
      return;
    }

    this.job = new CronJob(
      '0 3 1 * *',
      async () => {
        try {
          logger.info('Starting scheduled subscription candidate detection...');
          await this.runForAllUsers();
          logger.info('Scheduled subscription candidate detection completed');
        } catch (error) {
          logger.error({
            message: 'Scheduled subscription candidate detection failed:',
            error: error as Error,
          });
        }
      },
      null,
      false,
      'UTC',
    );

    this.job.start();
    logger.info('subscription candidate detection cron job started - runs 1st of month at 3:00 AM UTC');
  }

  public stopCron(): void {
    if (this.job) {
      this.job.stop();
      this.job = null;
      logger.info('subscription candidate detection cron job stopped');
    }
  }

  public isRunning(): boolean {
    return this.job?.running || false;
  }

  private async runForAllUsers(): Promise<void> {
    const users = await Users.findAll({
      attributes: ['id'],
      raw: true,
    });

    let successCount = 0;
    let errorCount = 0;

    for (const user of users) {
      try {
        const candidates = await runDetection({ userId: user.id });
        if (candidates.length > 0) {
          logger.info(`[cron] Created ${candidates.length} candidates for user ${user.id}`);
        }
        successCount++;
      } catch (error) {
        errorCount++;
        logger.error({
          message: `[cron] Failed to detect candidates for user ${user.id}`,
          error: error as Error,
        });
      }
    }

    logger.info(`[cron] Detection complete: ${successCount} users processed, ${errorCount} errors`);
  }
}

export const subscriptionCandidateDetectionCron = new SubscriptionCandidateDetectionCronService();
