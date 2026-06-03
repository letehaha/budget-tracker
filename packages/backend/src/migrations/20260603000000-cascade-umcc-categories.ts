import { QueryInterface, Transaction } from 'sequelize';

/**
 * Add ON DELETE CASCADE to UserMerchantCategoryCodes.categoryId.
 *
 * The original FK (1609339594639-create-user-mcc.js) defaulted to NO ACTION, so deleting a
 * Category linked to a UMCC row raised a foreign-key violation. That broke user-scoped
 * destructive flows (wipe-data, delete-user) the moment a user had any MCC mappings: the
 * Categories DELETE aborted the whole transaction. Cascading at the schema level removes
 * the service-level ordering pressure and protects both flows symmetrically.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeConstraint('UserMerchantCategoryCodes', 'UserMerchantCategoryCodes_categoryId_fkey', {
        transaction: t,
      });
      await queryInterface.addConstraint('UserMerchantCategoryCodes', {
        fields: ['categoryId'],
        type: 'foreign key',
        name: 'UserMerchantCategoryCodes_categoryId_fkey',
        references: { table: 'Categories', field: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        transaction: t,
      });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeConstraint('UserMerchantCategoryCodes', 'UserMerchantCategoryCodes_categoryId_fkey', {
        transaction: t,
      });
      await queryInterface.addConstraint('UserMerchantCategoryCodes', {
        fields: ['categoryId'],
        type: 'foreign key',
        name: 'UserMerchantCategoryCodes_categoryId_fkey',
        references: { table: 'Categories', field: 'id' },
        onUpdate: 'NO ACTION',
        onDelete: 'NO ACTION',
        transaction: t,
      });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
