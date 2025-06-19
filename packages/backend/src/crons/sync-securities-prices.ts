import { logger } from '@js/utils';
import { syncDailyPrices } from '@root/services/investments/securities-price/price-sync.service';
import { CronJob } from 'cron';

class SecuritiesPricesSyncCronService {
  private job: CronJob | null = null;

  /**
   * Starts the securities prices sync cron job
   * Runs every Sunday at 2:00 AM (when markets are closed)
   * Pattern: '0 2 * * 0' = At 02:00 on Sunday
   */
  public startCron(): void {
    if (this.job) {
      logger.info('Securities prices sync cron job is already running');
      return;
    }

    // Run every Sunday at 2 AM
    this.job = new CronJob(
      '0 2 * * 0',
      async () => {
        try {
          logger.info('Starting scheduled securities prices sync...');
          await syncDailyPrices();
          logger.info('Scheduled securities sync completed');
        } catch (error) {
          logger.error({ message: 'Scheduled securities prices sync failed:', error: error as Error });
        }
      },
      null, // onComplete
      false, // start immediately = false (we'll start manually)
      'America/New_York', // timezone - important for market schedules
    );

    this.job.start();
    logger.info('Securities prices sync cron job started - runs every Sunday at 2:00 AM EST');
  }

  public stopCron(): void {
    if (this.job) {
      this.job.stop();
      this.job = null;
      logger.info('Securities prices sync cron job stopped');
    }
  }

  public isRunning(): boolean {
    return this.job?.running || false;
  }
}

export const securitiesPricesSyncCron = new SecuritiesPricesSyncCronService();
