import { logger } from '@js/utils';
import Securities from '@models/investments/Securities.model';
import { withTransaction } from '@services/common';

import { SecuritySearchResult } from './data-providers';

const addOrUpdateFromProviderImpl = async (
  securitiesFromProvider: SecuritySearchResult[],
): Promise<{ newCount: number }> => {
  if (!securitiesFromProvider || securitiesFromProvider.length === 0) {
    logger.warn('No securities provided to sync. Aborting.');
    return { newCount: 0 };
  }

  // Get all existing symbols from our database for quick lookup
  const existingSecurities = await Securities.findAll({
    attributes: ['symbol'],
    raw: true,
  });
  const existingSymbols = new Set(existingSecurities.map((s) => s.symbol));
  logger.info(`Found ${existingSymbols.size} existing securities in the database.`);

  // Filter out securities that already exist in our DB
  // TODO: do not filter out and do updation instead, so we always have fresh data
  const newSecurities = securitiesFromProvider.filter((s) => s.symbol && !existingSymbols.has(s.symbol));
  logger.info(`Found ${newSecurities.length} new securities to be added.`);

  if (newSecurities.length === 0) {
    logger.info('Database is already up-to-date. No new securities to add.');
    return { newCount: 0 };
  }

  // Prepare the new securities for bulk insertion
  const securitiesToCreate = newSecurities.map((security) => ({
    symbol: security.symbol,
    name: security.name,
    assetClass: security.assetClass,
    providerName: security.providerName,
    currencyCode: security.currencyCode,
    exchangeMic: security.exchangeMic,
    isBrokerageCash: false,
  }));

  // Bulk create the new securities in the database
  await Securities.bulkCreate(securitiesToCreate, {
    ignoreDuplicates: true, // As a safeguard
  });
  logger.info(`Successfully added ${newSecurities.length} new securities.`);

  return { newCount: newSecurities.length };
};

/**
 * Takes a list of security search results from any provider, checks against
 * the local database, and saves any new securities within a DB transaction.
 */
export const addOrUpdateFromProvider = withTransaction(addOrUpdateFromProviderImpl);
