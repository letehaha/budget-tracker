import { ACCOUNT_TYPES } from '@bt/shared/types';
import { logger } from '@js/utils';
import { getAccounts } from '@services/accounts.service';
import * as lunchflowRefreshBalance from '@services/banks/lunchflow/refresh-balance';
import * as lunchflowSyncTransactions from '@services/banks/lunchflow/sync-transactions';
import { CronJob } from 'cron';

class LunchflowSyncCronService {
  private job: CronJob | null = null;

  /**
   * Starts the Lunchflow sync cron job
   * Runs every 4 hours to sync transactions and refresh balances
   *
   * For each Lunchflow account:
   * 1. Syncs new transactions
   * 2. Refreshes balance from Lunchflow API
   */
  public startCron(): void {
    if (this.job) {
      logger.info('Lunchflow sync cron job is already running');
      return;
    }

    // Run every 4 hours
    this.job = new CronJob(
      '0 */4 * * *',
      async () => {
        try {
          logger.info('Starting scheduled Lunchflow sync...');
          const result = await this.syncAllLunchflowAccounts();
          logger.info('Scheduled Lunchflow sync completed', {
            totalAccounts: result.totalAccounts,
            successfulSyncs: result.successfulSyncs,
            failedSyncs: result.failedSyncs,
            errorCount: result.errors.length,
          });
        } catch (error) {
          logger.error({
            message: 'Scheduled Lunchflow sync failed:',
            error: error as Error,
          });
        }
      },
      null, // onComplete
      false, // start immediately = false (we'll start manually)
      'UTC', // timezone
    );

    this.job.start();
    logger.info('Lunchflow sync cron job started - runs every 4 hours');
  }

  public stopCron(): void {
    if (this.job) {
      this.job.stop();
      this.job = null;
      logger.info('Lunchflow sync cron job stopped');
    }
  }

  public isRunning(): boolean {
    return this.job?.running || false;
  }

  /**
   * Manually trigger the sync job (useful for testing or manual runs)
   */
  public async triggerManualSync(): Promise<{
    totalAccounts: number;
    successfulSyncs: number;
    failedSyncs: number;
    errors: Array<{ accountId: number; userId: number; error: string }>;
  }> {
    try {
      logger.info('Starting manual Lunchflow sync...');
      const result = await this.syncAllLunchflowAccounts();
      logger.info('Manual Lunchflow sync completed', {
        totalAccounts: result.totalAccounts,
        successfulSyncs: result.successfulSyncs,
        failedSyncs: result.failedSyncs,
        errorCount: result.errors.length,
      });
      return result;
    } catch (error) {
      logger.error({
        message: 'Manual Lunchflow sync failed:',
        error: error as Error,
      });
      throw error;
    }
  }

  /**
   * Syncs all Lunchflow accounts in the system
   * For each account:
   * 1. Syncs new transactions
   * 2. Refreshes balance
   */
  private async syncAllLunchflowAccounts(): Promise<{
    totalAccounts: number;
    successfulSyncs: number;
    failedSyncs: number;
    errors: Array<{ accountId: number; userId: number; error: string }>;
  }> {
    // Get all Lunchflow accounts across all users
    // We need to get unique userIds first, then get accounts per user
    const allUsers = await this.getAllUsersWithLunchflowAccounts();

    const allAccounts: Array<{ id: number; userId: number }> = [];

    for (const userId of allUsers) {
      const accounts = await getAccounts({
        userId,
        type: ACCOUNT_TYPES.lunchflow,
      });
      allAccounts.push(...accounts);
    }

    const lunchflowAccounts = allAccounts;

    const result = {
      totalAccounts: lunchflowAccounts.length,
      successfulSyncs: 0,
      failedSyncs: 0,
      errors: [] as Array<{ accountId: number; userId: number; error: string }>,
    };

    if (lunchflowAccounts.length === 0) {
      logger.info('No Lunchflow accounts found to sync');
      return result;
    }

    logger.info(`Found ${lunchflowAccounts.length} Lunchflow account(s) to sync`);

    // Sync each account
    for (const account of lunchflowAccounts) {
      try {
        // 1. Sync transactions
        await lunchflowSyncTransactions.syncTransactions({
          userId: account.userId,
          accountId: account.id,
        });

        // 2. Refresh balance
        await lunchflowRefreshBalance.refreshBalance({
          userId: account.userId,
          accountId: account.id,
        });

        result.successfulSyncs++;
        logger.info(`Successfully synced Lunchflow account ${account.id} for user ${account.userId}`);
      } catch (error) {
        result.failedSyncs++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push({
          accountId: account.id,
          userId: account.userId,
          error: errorMessage,
        });
        logger.error({
          message: `Failed to sync Lunchflow account ${account.id} for user ${account.userId}`,
          error: error as Error,
        });
      }
    }

    return result;
  }

  /**
   * Helper to get all unique user IDs that have Lunchflow accounts
   */
  private async getAllUsersWithLunchflowAccounts(): Promise<number[]> {
    const Accounts = (await import('@models/Accounts.model')).default;
    const accounts = await Accounts.findAll({
      where: {
        type: ACCOUNT_TYPES.lunchflow,
      },
      attributes: ['userId'],
      group: ['userId'],
      raw: true,
    });

    return accounts.map((acc: { userId: number }) => acc.userId);
  }
}

export const lunchflowSyncCron = new LunchflowSyncCronService();
