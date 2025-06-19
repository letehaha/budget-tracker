import { logger } from '@js/utils';
import { syncAllSecurities } from '@root/services/investments/securities-sync.service';
import { CronJob } from 'cron';

class SecuritiesSyncCronService {
  private job: CronJob | null = null;

  /**
   * Starts the securities sync cron job
   * Runs every Sunday at 2:00 AM (when markets are closed)
   * Pattern: '0 2 * * 0' = At 02:00 on Sunday
   */
  public startCron(): void {
    if (this.job) {
      logger.info('Securities sync cron job is already running');
      return;
    }

    // Run every Sunday at 2 AM
    this.job = new CronJob(
      '0 2 * * 0',
      async () => {
        try {
          logger.info('Starting scheduled securities sync...');
          const result = await syncAllSecurities();
          logger.info(
            `Scheduled securities sync completed. New: ${result.newCount}, Total fetched: ${result.totalFetched}`,
          );
        } catch (error) {
          logger.error({ message: 'Scheduled securities sync failed:', error: error as Error });
        }
      },
      null, // onComplete
      false, // start immediately = false (we'll start manually)
      'America/New_York', // timezone - important for market schedules
    );

    this.job.start();
    logger.info('Securities sync cron job started - runs every Sunday at 2:00 AM EST');
  }

  public stopCron(): void {
    if (this.job) {
      this.job.stop();
      this.job = null;
      logger.info('Securities sync cron job stopped');
    }
  }

  public isRunning(): boolean {
    return this.job?.running || false;
  }

  /**
   * Manually trigger a sync (useful for testing or admin operations)
   */
  public async triggerManualSync(): Promise<{ newCount: number; totalFetched: number }> {
    logger.info('Manual securities sync triggered');
    try {
      const result = await syncAllSecurities();
      logger.info(`Manual securities sync completed. New: ${result.newCount}, Total fetched: ${result.totalFetched}`);
      return result;
    } catch (error) {
      logger.error({ message: 'Manual securities sync failed:', error: error as Error });
      throw error;
    }
  }
}

export const securitiesSyncCron = new SecuritiesSyncCronService();
