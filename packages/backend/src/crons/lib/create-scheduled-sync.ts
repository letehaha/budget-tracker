import { LockedError } from '@js/errors';
import { logger } from '@js/utils';
import { CronJob } from 'cron';

/**
 * Shape produced by the price-sync services we wrap. Kept loose because the
 * factory only needs the counts for logging; richer typing would couple this
 * module to securities-daily-sync internals.
 */
interface SyncResult {
  totalProcessed: number;
  successfulUpdates: number;
  failedUpdates: number;
  errors: unknown[];
}

interface ScheduledSyncDefinition {
  /** Short identifier used in log lines. */
  name: string;
  /** Cron expression for the scheduled run. */
  cronExpression: string;
  /** Timezone the cron schedule is interpreted in. */
  timeZone: string;
  /** Human-readable schedule description, appended to the "started" log line. */
  scheduleDescription: string;
  /** Function that performs the actual sync. */
  run: () => Promise<SyncResult>;
}

interface ScheduledSync {
  startCron: () => void;
  stopCron: () => void;
  isRunning: () => boolean;
  triggerManualSync: () => Promise<SyncResult>;
}

const logResult = ({ name, source, result }: { name: string; source: string; result: SyncResult }): void => {
  logger.info(`${source} ${name} sync completed`, {
    totalProcessed: result.totalProcessed,
    successfulUpdates: result.successfulUpdates,
    failedUpdates: result.failedUpdates,
    errorCount: result.errors.length,
  });
};

/**
 * `LockedError` means another instance of the same sync is still running. Not
 * an error — surfacing it at `error` level would page operators every time a
 * long-running stocks sync overlaps the manual button. Log at info instead.
 */
const isExpectedConcurrentRun = (error: unknown): error is LockedError => error instanceof LockedError;

/**
 * Factory for the cron + manual-trigger wrapper around a sync function.
 *
 * Two existing services (`securitiesPricesStocksDailySync` and
 * `securitiesPricesCryptoSync`) are wrapped by their respective crons; this
 * factory eliminates ~90 lines of duplicated cron boilerplate that previously
 * lived in each `crons/*.ts` file.
 *
 * Scheduled failures are logged but not re-thrown — `cron` would swallow the
 * promise rejection anyway, and re-throwing would just produce an unhandled
 * rejection. Manual triggers re-throw so the controller can surface the
 * failure to the operator.
 */
export const createScheduledSync = (definition: ScheduledSyncDefinition): ScheduledSync => {
  const { name, cronExpression, timeZone, scheduleDescription, run } = definition;
  let job: CronJob | null = null;

  const runScheduled = async (): Promise<void> => {
    try {
      logger.info(`Starting scheduled ${name} sync...`);
      const result = await run();
      logResult({ name, source: 'Scheduled', result });
    } catch (error) {
      if (isExpectedConcurrentRun(error)) {
        logger.info(`Scheduled ${name} sync skipped — previous run still in progress`);
        return;
      }
      logger.error({
        message: `Scheduled ${name} sync failed`,
        error: error as Error,
      });
    }
  };

  return {
    startCron(): void {
      if (job) {
        logger.info(`${name} sync cron job is already running`);
        return;
      }
      job = new CronJob(cronExpression, runScheduled, null, false, timeZone);
      job.start();
      logger.info(`${name} sync cron job started — ${scheduleDescription}`);
    },

    stopCron(): void {
      if (job) {
        job.stop();
        job = null;
        logger.info(`${name} sync cron job stopped`);
      }
    },

    isRunning(): boolean {
      return job?.running ?? false;
    },

    async triggerManualSync(): Promise<SyncResult> {
      logger.info(`Starting manual ${name} sync...`);
      try {
        const result = await run();
        logResult({ name, source: 'Manual', result });
        return result;
      } catch (error) {
        if (isExpectedConcurrentRun(error)) {
          logger.info(`Manual ${name} sync rejected — previous run still in progress`);
        } else {
          logger.error({
            message: `Manual ${name} sync failed`,
            error: error as Error,
          });
        }
        throw error;
      }
    },
  };
};
