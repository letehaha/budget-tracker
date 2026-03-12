import { logger } from '@js/utils';
import { checkPaymentReminders } from '@services/payment-reminders/check-reminders';
import { CronJob } from 'cron';

/**
 * Payment reminders cron service.
 *
 * Runs every 2 hours to:
 * 1. Update overdue period statuses
 * 2. Create missing next periods for recurring reminders
 * 3. Send remind-before notifications (in-app + email queue)
 */
class PaymentRemindersCronService {
  private job: CronJob | null = null;

  public startCron(): void {
    if (this.job) {
      logger.info('Payment reminders cron is already running');
      return;
    }

    this.job = new CronJob(
      '0 */2 * * *', // Every 2 hours at :00
      async () => {
        try {
          logger.info('Starting payment reminders check');
          const result = await checkPaymentReminders();
          logger.info('Payment reminders check completed', {
            totalChecked: result.totalChecked,
            overdueUpdated: result.overdueUpdated,
            notificationsSent: result.notificationsSent,
            emailsQueued: result.emailsQueued,
            periodsCreated: result.periodsCreated,
            errors: result.errors,
          });
        } catch (error) {
          logger.error({
            message: 'Payment reminders check failed',
            error: error as Error,
          });
        }
      },
      null,
      false,
      'UTC',
    );

    this.job.start();
    logger.info('Payment reminders cron started - runs every 2 hours');
  }

  public stopCron(): void {
    if (this.job) {
      this.job.stop();
      this.job = null;
      logger.info('Payment reminders cron stopped');
    }
  }

  public isRunning(): boolean {
    return this.job !== null;
  }

  public async triggerManualCheck() {
    try {
      logger.info('Starting manual payment reminders check');
      const result = await checkPaymentReminders();
      logger.info('Manual payment reminders check completed', {
        totalChecked: result.totalChecked,
        overdueUpdated: result.overdueUpdated,
        notificationsSent: result.notificationsSent,
        emailsQueued: result.emailsQueued,
        periodsCreated: result.periodsCreated,
        errors: result.errors,
      });
      return result;
    } catch (error) {
      logger.error({
        message: 'Manual payment reminders check failed',
        error: error as Error,
      });
      throw error;
    }
  }
}

export const paymentRemindersCron = new PaymentRemindersCronService();
