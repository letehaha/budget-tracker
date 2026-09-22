import { DataTypes, QueryInterface } from 'sequelize';

/**
 * `FeatureUsages` — how many times a user ran a feature their plan does not include,
 * counted against `FEATURE_TRIAL_LIMITS`. One row per (user, feature); `updatedAt` is
 * the last use.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'FeatureUsages',
        {
          id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
          },
          userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'Users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          feature: {
            type: DataTypes.STRING(64),
            allowNull: false,
          },
          usedCount: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
          },
          createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
          },
          updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
          },
        },
        { transaction },
      );

      await queryInterface.addIndex('FeatureUsages', ['userId', 'feature'], {
        unique: true,
        name: 'feature_usages_user_id_feature_unique',
        transaction,
      });
    });
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable('FeatureUsages', { transaction });
    });
  },
};
