import { logger } from '@js/utils';
import { processAutoRecordPeriods } from '@services/subscriptions/process-auto-record';
import { CronJob } from 'cron';

/**
 * Hourly cron that books transactions for every due auto-record period.
 *
 * Runs every hour at :05 (offset from the reminders cron's :00 so the two are
 * not contending on the same Subscriptions/SubscriptionPeriods rows in the
 * same Postgres second). One tick per hour gives the auto path 24 chances to
 * book a same-day period before the reminders cron's overdue marker can reach
 * it — see `processAutoRecordPeriods` for the full race story.
 */
class SubscriptionAutoRecordCronService {
  private job: CronJob | null = null;

  public startCron(): void {
    if (this.job) {
      logger.info('Subscription auto-record cron is already running');
      return;
    }

    this.job = new CronJob(
      '5 * * * *',
      async () => {
        try {
          logger.info('Starting subscription auto-record run');
          const result = await processAutoRecordPeriods();
          logger.info('Subscription auto-record run completed', {
            booked: result.booked,
            failed: result.failed,
          });
        } catch (error) {
          logger.error({
            message: 'Subscription auto-record run failed',
            error: error as Error,
          });
        }
      },
      null,
      false,
      'UTC',
    );

    this.job.start();
    logger.info('Subscription auto-record cron started - runs hourly');
  }

  public stopCron(): void {
    if (this.job) {
      this.job.stop();
      this.job = null;
      logger.info('Subscription auto-record cron stopped');
    }
  }
}

export const subscriptionAutoRecordCron = new SubscriptionAutoRecordCronService();
