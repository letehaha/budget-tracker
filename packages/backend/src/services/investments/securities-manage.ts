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

  // Partition incoming securities into new inserts vs updates in a single pass
  const [newSecurities, existingToUpdate] = securitiesFromProvider.reduce<
    [SecuritySearchResult[], SecuritySearchResult[]]
  >(
    (acc, sec) => {
      (sec.symbol && existingSymbols.has(sec.symbol) ? acc[1] : acc[0]).push(sec);
      return acc;
    },
    [[], []],
  );

  const newCount = newSecurities.length;
  logger.info(`New securities to add: ${newCount}. Records to update: ${existingToUpdate.length}.`);

  // Prepare bulk insert payload for new securities
  const securitiesToCreate = newSecurities.map((security) => ({
    symbol: security.symbol,
    name: security.name,
    assetClass: security.assetClass,
    providerName: security.providerName,
    currencyCode: security.currencyCode.toUpperCase(),
    exchangeMic: security.exchangeMic,
    exchangeAcronym: security.exchangeAcronym || null,
    exchangeName: security.exchangeName || null,
    isBrokerageCash: false,
  }));

  if (securitiesToCreate.length) {
    await Securities.bulkCreate(securitiesToCreate);
  }

  // Update existing securities metadata where necessary
  if (existingToUpdate.length) {
    const updatePromises = existingToUpdate.map((sec) =>
      Securities.update(
        {
          name: sec.name,
          assetClass: sec.assetClass,
          providerName: sec.providerName,
          currencyCode: sec.currencyCode.toUpperCase(),
          exchangeMic: sec.exchangeMic,
          exchangeAcronym: sec.exchangeAcronym || null,
          exchangeName: sec.exchangeName || null,
        },
        { where: { symbol: sec.symbol } },
      ),
    );
    await Promise.all(updatePromises);
  }

  logger.info(`Securities sync completed. New: ${newCount}, updated: ${existingToUpdate.length}.`);

  return { newCount };
};

/**
 * Takes a list of security search results from any provider, checks against
 * the local database, and saves any new securities within a DB transaction.
 */
export const addOrUpdateFromProvider = withTransaction(addOrUpdateFromProviderImpl);
