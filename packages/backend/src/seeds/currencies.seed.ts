import { QueryInterface, QueryTypes } from 'sequelize';

// Import the currency codes data
// eslint-disable-next-line @typescript-eslint/no-var-requires
const allCurrencies = require('currency-codes/data');

/**
 * Seed currencies table with all currency codes data
 * This function is idempotent and can be run multiple times safely
 *
 * @param queryInterface - Sequelize query interface
 */
export const seedCurrencies = async (queryInterface: QueryInterface): Promise<void> => {
  const transaction = await queryInterface.sequelize.transaction();

  try {
    // Check if currencies already exist to avoid duplicates
    const existingCurrencies = await queryInterface.sequelize.query('SELECT COUNT(*) as count FROM "Currencies"', {
      type: QueryTypes.SELECT,
      transaction,
      raw: true,
    });

    const count = (existingCurrencies[0] as { count: string }).count;

    if (Number(count) > 0) {
      await transaction.commit();
      return;
    }

    // Insert all currencies from currency-codes package
    const currenciesToInsert = allCurrencies.map(
      (item: { currency: string; digits: number; number: string; code: string }) => ({
        currency: item.currency,
        digits: item.digits,
        number: Number(item.number),
        code: item.code,
      }),
    );

    await queryInterface.bulkInsert('Currencies', currenciesToInsert, {
      transaction,
    });

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    console.error('  ❌ Failed to seed currencies:', error);
    throw error;
  }
};

/**
 * Remove all currencies from the database
 * Useful for testing or complete database reset
 *
 * @param queryInterface - Sequelize query interface
 */
export const unseedCurrencies = async (queryInterface: QueryInterface): Promise<void> => {
  const transaction = await queryInterface.sequelize.transaction();

  try {
    await queryInterface.sequelize.query('DELETE FROM "Currencies"', { transaction });

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    console.error('  ❌ Failed to remove currencies:', error);
    throw error;
  }
};
