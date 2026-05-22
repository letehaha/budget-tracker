import { logger } from '@js/utils';
import { purgeDeletedPortfolios } from '@services/investments/portfolios/purge-deleted.service';
import { CronJob } from 'cron';

/**
 * Daily sweep that finalises soft-deleted portfolios past the retention
 * window. The user-facing delete endpoint sets `deletedAt`; this job runs
 * `deletePortfolio({ force: true })` so child rows (holdings, investment
 * transactions, balances) are cascaded out.
 *
 * Schedule: 03:45 UTC daily, staggered after the existing share-related
 * sweeps (03:15 / 03:30) to avoid DB-connection contention.
 */
class PurgeDeletedPortfoliosCronService {
  private job: CronJob | null = null;

  /** Shared body for scheduled + manual runs; differs only in log labels. */
  private async runPurge(trigger: 'scheduled' | 'manual'): Promise<void> {
    const startLabel = trigger === 'scheduled' ? 'scheduled' : 'manual';
    const failedCode =
      trigger === 'scheduled' ? 'PURGE_DELETED_PORTFOLIOS_CRON_FAILED' : 'PURGE_DELETED_PORTFOLIOS_CRON_MANUAL_FAILED';

    try {
      logger.info(`Starting ${startLabel} purge of soft-deleted portfolios`);
      const result = await purgeDeletedPortfolios();
      logger.info(`Purge of soft-deleted portfolios completed (${startLabel})`, {
        purged: result.purgedCount,
        failed: result.failedCount,
      });
    } catch (error) {
      logger.error(
        {
          message: `${startLabel === 'scheduled' ? 'Scheduled' : 'Manual'} purge of soft-deleted portfolios failed`,
          error: error as Error,
        },
        { code: failedCode },
      );
      if (trigger === 'manual') throw error;
    }
  }

  public startCron(): void {
    if (this.job) {
      logger.info('Purge deleted portfolios cron is already running');
      return;
    }

    this.job = new CronJob('45 3 * * *', () => this.runPurge('scheduled'), null, false, 'UTC');

    this.job.start();
    logger.info('Purge deleted portfolios cron started — runs daily at 03:45 UTC');
  }

  public stopCron(): void {
    if (this.job) {
      this.job.stop();
      this.job = null;
      logger.info('Purge deleted portfolios cron stopped');
    }
  }

  public isRunning(): boolean {
    return this.job !== null;
  }

  /** Manual trigger — used by tests instead of waiting on the schedule. */
  public async triggerManualCheck(): Promise<void> {
    await this.runPurge('manual');
  }
}

export const purgeDeletedPortfoliosCron = new PurgeDeletedPortfoliosCronService();
