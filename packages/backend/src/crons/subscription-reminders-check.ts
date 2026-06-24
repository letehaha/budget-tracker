import { logger } from '@js/utils';
import { checkSubscriptionReminders } from '@services/subscriptions/check-subscription-reminders';
import { CronJob } from 'cron';

/**
 * Subscription reminders cron service.
 *
 * Runs every 2 hours to:
 * 1. Update overdue period statuses
 * 2. Send remind-before notifications (in-app + email queue)
 */
class SubscriptionRemindersCronService {
  private job: CronJob | null = null;

  public startCron(): void {
    if (this.job) {
      logger.info('Subscription reminders cron is already running');
      return;
    }

    this.job = new CronJob(
      '0 */2 * * *', // Every 2 hours at :00
      async () => {
        try {
          logger.info('Starting subscription reminders check');
          const result = await checkSubscriptionReminders();
          logger.info('Subscription reminders check completed', {
            overdueUpdated: result.overdueUpdated,
            remindersSent: result.remindersSent,
          });
        } catch (error) {
          logger.error({
            message: 'Subscription reminders check failed',
            error: error as Error,
          });
        }
      },
      null,
      false,
      'UTC',
    );

    this.job.start();
    logger.info('Subscription reminders cron started - runs every 2 hours');
  }

  public stopCron(): void {
    if (this.job) {
      this.job.stop();
      this.job = null;
      logger.info('Subscription reminders cron stopped');
    }
  }
}

export const subscriptionRemindersCron = new SubscriptionRemindersCronService();
