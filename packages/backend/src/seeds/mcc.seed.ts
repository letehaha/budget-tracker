import { QueryInterface, QueryTypes } from 'sequelize';

// Import the MCC codes data
import mccCodes from '../resources/mcc-codes.json';

/**
 * Seed MerchantCategoryCodes table with MCC codes data
 * This function is idempotent and can be run multiple times safely
 *
 * @param queryInterface - Sequelize query interface
 */
export const seedMerchantCategoryCodes = async (queryInterface: QueryInterface): Promise<void> => {
  const transaction = await queryInterface.sequelize.transaction();

  try {
    // Check if MCC codes already exist to avoid duplicates
    const existingMccCodes = await queryInterface.sequelize.query(
      'SELECT COUNT(*) as count FROM "MerchantCategoryCodes"',
      {
        type: QueryTypes.SELECT,
        transaction,
        raw: true,
      },
    );

    const count = (existingMccCodes[0] as { count: string }).count;

    if (Number(count) > 0) {
      await transaction.commit();
      return;
    }

    // Insert all MCC codes from JSON resource
    const mccCodesToInsert = (
      mccCodes as {
        mcc: string;
        edited_description: string;
        combined_description: string;
        usda_description: string;
        irs_description: string;
        irs_reportable: string;
        id: number;
      }[]
    ).map((code) => ({
      code: code.mcc,
      name: code.edited_description,
      description: code.irs_description,
    }));

    await queryInterface.bulkInsert('MerchantCategoryCodes', mccCodesToInsert, {
      transaction,
    });

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    console.error('  ❌ Failed to seed MCC codes:', error);
    throw error;
  }
};

/**
 * Remove all merchant category codes from the database
 * Useful for testing or complete database reset
 *
 * @param queryInterface - Sequelize query interface
 */
export const unseedMerchantCategoryCodes = async (queryInterface: QueryInterface): Promise<void> => {
  const transaction = await queryInterface.sequelize.transaction();

  try {
    await queryInterface.sequelize.query('DELETE FROM "MerchantCategoryCodes"', { transaction });

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    console.error('  ❌ Failed to remove MCC codes:', error);
    throw error;
  }
};
