import { QueryInterface } from 'sequelize';

import { seedCurrencies } from './currencies.seed';
import { seedMerchantCategoryCodes } from './mcc.seed';
import { seedExchangeRates } from './exchange-rates.seed';

/**
 * Main seeding function that orchestrates all seeding operations
 * Seeds are idempotent and can be run multiple times safely
 *
 * @param queryInterface - Sequelize query interface
 * @param environment - Environment specific seeding ('development' | 'production' | 'test')
 */
export const seedDatabase = async (
  queryInterface: QueryInterface,
  environment: 'development' | 'production' | 'test' = 'development',
): Promise<void> => {
  try {
    // Base seeds that run in all environments
    if (environment !== 'test') {
      console.log('📊 Seeding base data...');
    }
    await seedCurrencies(queryInterface);
    await seedMerchantCategoryCodes(queryInterface);
    await seedExchangeRates(queryInterface);

    if (environment !== 'test') {
      console.log('✅ Database seeding completed successfully');
    }
  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    throw error;
  }
};

// Export individual seed functions for granular control
export { seedCurrencies } from './currencies.seed';
export { seedMerchantCategoryCodes } from './mcc.seed';
export { seedExchangeRates } from './exchange-rates.seed';
