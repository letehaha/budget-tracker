import { SecuritySearchResult } from '@bt/shared/types/investments';
import { logger } from '@js/utils';
import Securities from '@models/investments/securities.model';
import { withTransaction } from '@services/common/with-transaction';
import { Op } from 'sequelize';

const dedupKey = (providerName: string, providerSymbol: string) => `${providerName}:${providerSymbol}`;

const addOrUpdateFromProviderImpl = async (
  securitiesFromProvider: SecuritySearchResult[],
): Promise<{ newCount: number }> => {
  if (!securitiesFromProvider || securitiesFromProvider.length === 0) {
    logger.info('No securities provided to sync. Aborting.');
    return { newCount: 0 };
  }

  // Look up existing (providerName, providerSymbol) tuples in one query — this is the
  // canonical identity now that crypto symbols may collide across providers.
  const incomingKeys = securitiesFromProvider.map((s) => dedupKey(s.providerName, s.providerSymbol));
  const providerNames = Array.from(new Set(securitiesFromProvider.map((s) => s.providerName)));
  const providerSymbols = Array.from(new Set(securitiesFromProvider.map((s) => s.providerSymbol)));

  const existingSecurities = await Securities.findAll({
    where: {
      providerName: { [Op.in]: providerNames },
      providerSymbol: { [Op.in]: providerSymbols },
    },
    attributes: ['providerName', 'providerSymbol'],
    raw: true,
  });
  const existingKeys = new Set(existingSecurities.map((s) => dedupKey(s.providerName, s.providerSymbol)));
  logger.info(`Found ${existingKeys.size} matching existing securities for ${incomingKeys.length} incoming entries.`);

  // Partition incoming securities into new inserts vs updates in a single pass
  const [newSecurities, existingToUpdate] = securitiesFromProvider.reduce<
    [SecuritySearchResult[], SecuritySearchResult[]]
  >(
    (acc, sec) => {
      (existingKeys.has(dedupKey(sec.providerName, sec.providerSymbol)) ? acc[1] : acc[0]).push(sec);
      return acc;
    },
    [[], []],
  );

  const newCount = newSecurities.length;
  logger.info(`New securities to add: ${newCount}. Records to update: ${existingToUpdate.length}.`);

  // Prepare bulk insert payload for new securities
  const securitiesToCreate = newSecurities.map((security) => ({
    symbol: security.symbol,
    providerSymbol: security.providerSymbol,
    name: security.name,
    assetClass: security.assetClass,
    providerName: security.providerName,
    currencyCode: security.currencyCode.toUpperCase(),
    cryptoCurrencyCode: security.cryptoCurrencyCode ?? null,
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
          symbol: sec.symbol,
          name: sec.name,
          assetClass: sec.assetClass,
          currencyCode: sec.currencyCode.toUpperCase(),
          cryptoCurrencyCode: sec.cryptoCurrencyCode ?? null,
          exchangeMic: sec.exchangeMic,
          exchangeAcronym: sec.exchangeAcronym || null,
          exchangeName: sec.exchangeName || null,
        },
        { where: { providerName: sec.providerName, providerSymbol: sec.providerSymbol } },
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
