import { SECURITY_PROVIDER } from '@bt/shared/types/investments';
import { logger } from '@js/utils';
import Holdings from '@models/investments/Holdings.model';
import Securities from '@models/investments/Securities.model';
import SecurityPricing from '@models/investments/SecurityPricing.model';
import { withTransaction } from '@services/common';
import { subDays } from 'date-fns';
import { Op } from 'sequelize';

import { dataProviderFactory } from '../data-providers';

interface SyncResult {
  totalHeldSecurities: number;
  processedByProvider: Record<string, number>;
  totalPricesFetched: number;
  errors: Array<{ securityId: number; symbol: string | null; provider: string; error: string }>;
}

/**
 * Fetches latest prices for securities that are linked to any holding record.
 * Uses each security's original provider to ensure correct symbol format and pricing data.
 * Handles database storage after fetching prices from providers.
 *
 * @param forDate - The specific date to sync prices for. Defaults to yesterday.
 * @returns A summary of the sync operation.
 */
const syncDailyPricesImpl = async (forDate: Date = subDays(new Date(), 1)): Promise<SyncResult> => {
  logger.info(`Starting holdings-based daily price sync for date: ${forDate.toISOString()}`);

  // Step 1: Fetch all securities that are linked to any holding record
  const linkedSecurities = await Securities.findAll({
    include: [
      {
        model: Holdings,
        required: true,
        attributes: [],
        // No quantity filter - include all securities with holding records
      },
    ],
    where: {
      symbol: { [Op.ne]: null }, // Only securities with symbols
      providerName: { [Op.ne]: null }, // Only securities with provider
    },
    group: ['Securities.id'], // Deduplicate securities held by multiple users
    raw: true,
  });

  if (linkedSecurities.length === 0) {
    logger.info('No securities with holdings found to sync prices for.');
    return {
      totalHeldSecurities: 0,
      processedByProvider: {},
      totalPricesFetched: 0,
      errors: [],
    };
  }

  // Step 2: Create a map of securities grouped by provider
  const securitiesByProvider = linkedSecurities.reduce<Record<SECURITY_PROVIDER, Securities[]>>(
    (acc, security) => {
      if (!acc[security.providerName]) {
        acc[security.providerName] = [];
      }
      acc[security.providerName].push(security);
      return acc;
    },
    {} as Record<SECURITY_PROVIDER, Securities[]>,
  );

  logger.info(
    `Found ${linkedSecurities.length} securities with holdings across ${Object.keys(securitiesByProvider).length} providers`,
  );

  const result: SyncResult = {
    totalHeldSecurities: linkedSecurities.length,
    processedByProvider: {},
    totalPricesFetched: 0,
    errors: [],
  };

  // Step 3: Process each provider's securities using dedicated provider logic
  for (const [providerName, providerSecurities] of Object.entries(securitiesByProvider)) {
    try {
      const provider = dataProviderFactory.getProvider(providerName as SECURITY_PROVIDER);

      logger.info(`Processing ${providerSecurities.length} securities for provider: ${providerName}`);
      result.processedByProvider[providerName] = providerSecurities.length;

      // Step 4: Fetch prices from provider and store in database
      const symbols = providerSecurities.filter((s) => !!s.symbol).map((s) => s.symbol!);
      const securityIdMap = new Map(providerSecurities.map((s) => [s.symbol!, s.id]));

      const fetchedPrices = await provider.fetchPricesForSecurities(symbols, forDate);

      // Step 5: Store fetched prices in database
      let storedCount = 0;
      for (const priceData of fetchedPrices) {
        try {
          const securityId = securityIdMap.get(priceData.symbol);
          if (!securityId) {
            logger.warn(`No security ID found for symbol: ${priceData.symbol}`);
            continue;
          }

          const [, created] = await SecurityPricing.upsert({
            securityId,
            date: forDate,
            priceClose: priceData.priceClose.toString(),
            source: providerName,
          });

          storedCount++;
          logger.info(`${created ? 'Created' : 'Updated'} price for ${priceData.symbol}: ${priceData.priceClose}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`Failed to store price for ${priceData.symbol}: ${errorMessage}`);

          // Find the security for error reporting
          const security = providerSecurities.find((s) => s.symbol === priceData.symbol);
          if (security) {
            result.errors.push({
              securityId: security.id,
              symbol: security.symbol,
              provider: providerName,
              error: errorMessage,
            });
          }
        }
      }

      result.totalPricesFetched += storedCount;
      logger.info(`Successfully fetched ${fetchedPrices.length} prices and stored ${storedCount} for ${providerName}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to sync prices for provider ${providerName}: ${errorMessage}`);

      // Add errors for all securities in this provider
      for (const security of providerSecurities) {
        result.errors.push({
          securityId: security.id,
          symbol: security.symbol,
          provider: providerName,
          error: errorMessage,
        });
      }
    }
  }

  logger.info(
    `Price sync complete. Processed ${result.totalHeldSecurities} securities with holdings, fetched ${result.totalPricesFetched} prices, ${result.errors.length} errors`,
  );

  return result;
};

export const syncDailyPrices = withTransaction(syncDailyPricesImpl);
