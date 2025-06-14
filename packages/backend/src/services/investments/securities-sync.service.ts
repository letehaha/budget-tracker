import { SECURITY_PROVIDER } from '@bt/shared/types/investments';
import { logger } from '@js/utils';
import { withTransaction } from '@services/common';
import { withLock } from '@services/common/lock';

import { dataProviderFactory } from './data-providers/provider-factory';
import * as securitiesManager from './securities-manage';

// A unique key to identify this specific sync job in Redis.
export const SECURITIES_SYNC_LOCK_KEY = 'lock:sync:securities';

const syncAllSecuritiesImpl = async (): Promise<{
  newCount: number;
  totalFetched: number;
}> => {
  logger.info('Starting generic securities sync orchestration...');

  // Get the default provider from the factory
  const provider = dataProviderFactory.getProvider(SECURITY_PROVIDER.polygon);

  // Get normalized data
  const genericSecurities = await provider.getAllSecurities();
  logger.info(`Fetched ${genericSecurities.length} securities from the provider.`);

  // Pass the generic data to the manager service to handle DB logic.
  const { newCount } = await securitiesManager.addOrUpdateFromProvider(genericSecurities);

  logger.info('Securities sync orchestration finished.');

  return { newCount, totalFetched: genericSecurities.length };
};

export const syncAllSecurities = withLock(SECURITIES_SYNC_LOCK_KEY, withTransaction(syncAllSecuritiesImpl));
