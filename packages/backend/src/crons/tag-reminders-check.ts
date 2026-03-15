import { logger } from '@js/utils';
import { checkScheduledReminders } from '@services/tag-reminders/check-reminders';
import { CronJob } from 'cron';

/**
 * Tag reminders cron service.
 *
 * Runs a single daily job that checks all scheduled reminders.
 * Each reminder is evaluated based on its frequency preset (daily/weekly/monthly/quarterly/yearly).
 */
class TagRemindersCronService {
  private job: CronJob | null = null;

  /**
   * Starts the tag reminder cron job.
   * Runs daily at 7:00 AM UTC.
   */
  public startCron(): void {
    if (this.job) {
      logger.info('Tag reminders cron is already running');
      return;
    }

    this.job = new CronJob(
      '0 7 * * *', // Run at 7:00 AM UTC every day
      async () => {
        try {
          logger.info('Starting scheduled tag reminders check');
          const result = await checkScheduledReminders();
          logger.info('Scheduled tag reminders check completed', {
            totalChecked: result.totalChecked,
            triggered: result.triggered,
            skipped: result.skipped,
            errors: result.errors,
          });
        } catch (error) {
          logger.error({
            message: 'Scheduled tag reminders check failed',
            error: error as Error,
          });
        }
      },
      null, // onComplete
      false, // start immediately = false
      'UTC', // timezone
    );

    this.job.start();
    logger.info('Tag reminders cron started - runs daily at 7:00 AM UTC');
  }

  public stopCron(): void {
    if (this.job) {
      this.job.stop();
      this.job = null;
      logger.info('Tag reminders cron stopped');
    }
  }

  public isRunning(): boolean {
    return this.job !== null;
  }

  /**
   * Manually trigger a check (useful for testing)
   */
  public async triggerManualCheck(): Promise<void> {
    try {
      logger.info('Starting manual tag reminders check');
      const result = await checkScheduledReminders();
      logger.info('Manual tag reminders check completed', {
        totalChecked: result.totalChecked,
        triggered: result.triggered,
        skipped: result.skipped,
        errors: result.errors,
      });
    } catch (error) {
      logger.error({
        message: 'Manual tag reminders check failed',
        error: error as Error,
      });
      throw error;
    }
  }
}

export const tagRemindersCron = new TagRemindersCronService();
