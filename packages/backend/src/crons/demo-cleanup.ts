import { logger } from '@js/utils/logger';
import { cleanupExpiredDemoUsers } from '@services/demo/cleanup-demo-users.service';
import { CronJob } from 'cron';

/**
 * Demo user cleanup cron job.
 * Runs every 4 hours to clean up expired demo users.
 *
 * Schedule: "0 0,4,8,12,16,20 * * *" (every 4 hours)
 */
class DemoCleanupCronService {
  private cronJob: CronJob | null = null;
  private isJobRunning = false;

  /**
   * Starts the demo cleanup cron job.
   */
  public startCron(): void {
    if (this.cronJob) {
      logger.warn('Demo cleanup cron job is already running');
      return;
    }

    this.cronJob = new CronJob(
      '0 0,4,8,12,16,20 * * *', // Every 4 hours
      async () => {
        await this.runCleanup();
      },
      null, // onComplete
      false, // start immediately
      'UTC', // timeZone
    );

    this.cronJob.start();
    logger.info('Demo cleanup cron job started (runs every 4 hours)');
  }

  /**
   * Stops the demo cleanup cron job.
   */
  public stopCron(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info('Demo cleanup cron job stopped');
    }
  }

  /**
   * Checks if the cron job is currently running.
   */
  public isRunning(): boolean {
    return this.cronJob?.running ?? false;
  }

  /**
   * Manually triggers a demo cleanup.
   * Useful for testing or manual intervention.
   */
  public async triggerManualCleanup(): Promise<number> {
    return this.runCleanup();
  }

  /**
   * Internal method to run the cleanup process.
   */
  private async runCleanup(): Promise<number> {
    if (this.isJobRunning) {
      logger.warn('Demo cleanup job is already running, skipping this execution');
      return 0;
    }

    this.isJobRunning = true;
    const startTime = Date.now();

    try {
      logger.info('Starting demo user cleanup...');
      const cleanedCount = await cleanupExpiredDemoUsers();
      const duration = Date.now() - startTime;

      logger.info(`Demo cleanup completed: ${cleanedCount} users cleaned in ${duration}ms`);
      return cleanedCount;
    } catch (error) {
      logger.error({ message: 'Demo cleanup failed', error: error as Error });
      return 0;
    } finally {
      this.isJobRunning = false;
    }
  }
}

export const demoCleanupCron = new DemoCleanupCronService();
