import { DataTypes, QueryInterface } from 'sequelize';

/** `FeatureUsages.trialStartedAt` — when a day-based trial (`FEATURE_TRIAL_DAYS`) was started. */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        'FeatureUsages',
        'trialStartedAt',
        { type: DataTypes.DATE, allowNull: true },
        { transaction },
      );
    });
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn('FeatureUsages', 'trialStartedAt', { transaction });
    });
  },
};
