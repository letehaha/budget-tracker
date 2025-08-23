import { logger } from '@js/utils';
import Holdings from '@models/investments/Holdings.model';
import Securities from '@models/investments/Securities.model';
import SecurityPricing from '@models/investments/SecurityPricing.model';
import { withTransaction } from '@services/common';
import { withLock } from '@services/common/lock';

import { dataProviderFactory } from '../data-providers';

const DAILY_HOLDINGS_SYNC_LOCK_KEY = 'lock:sync:daily-holdings-prices';

interface SyncResult {
  totalHoldings: number;
  successfulUpdates: number;
  failedUpdates: number;
  skippedUpdates: number;
}

/**
 * Sync latest prices for all securities that users actually hold in their portfolios.
 * This replaces the bulk price sync approach with on-demand fetching for held securities only.
 */
const syncDailyHoldingsPricesImpl = async (): Promise<SyncResult> => {
  logger.info('Starting daily holdings price sync...');

  // Get all unique securities that are held in portfolios
  const heldSecurities = await Holdings.findAll({
    include: [
      {
        model: Securities,
        as: 'security',
        attributes: ['id', 'symbol', 'name', 'providerName'],
        required: true,
      },
    ],
    attributes: ['securityId'],
    group: ['securityId', 'security.id'], // Deduplicate by securityId
    raw: false,
  });

  const totalHoldings = heldSecurities.length;
  let successfulUpdates = 0;
  let failedUpdates = 0;
  let skippedUpdates = 0;

  logger.info(`Found ${totalHoldings} unique securities held in portfolios`);

  if (totalHoldings === 0) {
    logger.info('No held securities found, skipping price sync');
    return { totalHoldings: 0, successfulUpdates: 0, failedUpdates: 0, skippedUpdates: 0 };
  }

  // Process each held security
  for (const holding of heldSecurities) {
    const security = holding.security!;

    try {
      logger.info(`Fetching latest price for held security: ${security.symbol}`);

      // Get the appropriate provider for this security
      const provider = dataProviderFactory.getProvider();

      // Fetch latest price
      const priceData = await provider.getLatestPrice(security.symbol!);

      // Check if we already have this price for today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const existingPrice = await SecurityPricing.findOne({
        where: {
          securityId: security.id,
          date: {
            $gte: today,
            $lt: tomorrow,
          },
        },
      });

      if (existingPrice) {
        logger.info(`Price for ${security.symbol} already exists for today, skipping`);
        skippedUpdates++;
        continue;
      }

      // Store the price
      await SecurityPricing.create({
        securityId: security.id,
        date: priceData.date,
        priceClose: priceData.priceClose.toString(),
        source: provider.providerName,
      });

      // Update security's last sync timestamp
      security.pricingLastSyncedAt = new Date();
      await security.save();

      successfulUpdates++;
      logger.info(`Successfully updated price for ${security.symbol}: ${priceData.priceClose}`);

      // Add small delay to respect API rate limits
      await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
    } catch (error) {
      failedUpdates++;
      logger.error({
        message: `Failed to update price for ${security.symbol}`,
        error: error as Error,
      });
      // Continue processing other securities even if one fails
    }
  }

  logger.info(
    `Daily holdings price sync completed. Total: ${totalHoldings}, Success: ${successfulUpdates}, Failed: ${failedUpdates}, Skipped: ${skippedUpdates}`,
  );

  return {
    totalHoldings,
    successfulUpdates,
    failedUpdates,
    skippedUpdates,
  };
};

/**
 * Sync daily prices for all held securities with locking to prevent concurrent execution.
 */
export const syncDailyHoldingsPrices = withLock(
  DAILY_HOLDINGS_SYNC_LOCK_KEY,
  withTransaction(syncDailyHoldingsPricesImpl),
);
