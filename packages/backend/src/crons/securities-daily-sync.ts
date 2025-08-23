import { logger } from '@js/utils';
import { securitiesPricesDailySync } from '@root/services/investments/securities-price/securities-daily-sync.service';
import { CronJob } from 'cron';

class SecuritiesDailyPricesSyncCronService {
  private job: CronJob | null = null;

  /**
   * Starts the securities daily price sync cron job
   * Runs every day at 6:00 AM EST (after global markets close)
   * Pattern: '0 6 * * *' = At 06:00 every day
   *
   * This timing ensures:
   * - US markets closed (4 PM EST previous day)
   * - European markets closed (5:30 PM GMT previous day)
   * - Asian markets closed (varies, but generally by 9 AM local time)
   */
  public startCron(): void {
    if (this.job) {
      logger.info('securities daily sync cron job is already running');
      return;
    }

    // Run every day at 6 AM EST
    this.job = new CronJob(
      '0 6 * * *',
      async () => {
        try {
          logger.info('Starting scheduled securities daily price sync...');
          const result = await securitiesPricesDailySync();
          logger.info('Scheduled securities daily sync completed', {
            totalProcessed: result.totalProcessed,
            successfulUpdates: result.successfulUpdates,
            failedUpdates: result.failedUpdates,
            errorCount: result.errors.length,
          });
        } catch (error) {
          logger.error({
            message: 'Scheduled securities daily sync failed:',
            error: error as Error,
          });
        }
      },
      null, // onComplete
      false, // start immediately = false (we'll start manually)
      'America/New_York', // timezone - important for market schedules
    );

    this.job.start();
    logger.info('securities daily sync cron job started - runs every day at 6:00 AM EST');
  }

  public stopCron(): void {
    if (this.job) {
      this.job.stop();
      this.job = null;
      logger.info('securities daily sync cron job stopped');
    }
  }

  public isRunning(): boolean {
    return this.job?.running || false;
  }

  /**
   * Manually trigger the sync job (useful for testing or manual runs)
   */
  public async triggerManualSync(): Promise<void> {
    try {
      logger.info('Starting manual securities daily price sync...');
      const result = await securitiesPricesDailySync();
      logger.info('Manual securities daily sync completed', {
        totalProcessed: result.totalProcessed,
        successfulUpdates: result.successfulUpdates,
        failedUpdates: result.failedUpdates,
        errorCount: result.errors.length,
      });
    } catch (error) {
      logger.error({
        message: 'Manual securities daily sync failed:',
        error: error as Error,
      });
      throw error;
    }
  }
}

export const securitiesDailySyncCron = new SecuritiesDailyPricesSyncCronService();
