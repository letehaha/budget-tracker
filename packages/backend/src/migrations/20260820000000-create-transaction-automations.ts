import { DataTypes, QueryInterface } from 'sequelize';

/**
 * `TransactionAutomations` — per-user ordered if/then rules evaluated against
 * transactions created by bank sync and file import.
 *
 * `position` carries no UNIQUE constraint: reorder rewrites every row of a user
 * in one transaction, which a unique index would force into a two-pass shuffle.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'TransactionAutomations',
        {
          id: {
            type: DataTypes.UUID,
            primaryKey: true,
            allowNull: false,
          },
          userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'Users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          name: {
            type: DataTypes.STRING(120),
            allowNull: false,
          },
          isEnabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
          },
          position: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: '0-based rank within the user list; rewritten by reorder, left sparse by delete',
          },
          conditions: {
            type: DataTypes.JSONB,
            allowNull: false,
            comment: 'AutomationConditions: { match, items[] }',
          },
          actions: {
            type: DataTypes.JSONB,
            allowNull: false,
            comment: 'AutomationAction[]',
          },
          matchCount: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
          },
          lastMatchedAt: {
            type: DataTypes.DATE,
            allowNull: true,
          },
          pausedReason: {
            type: DataTypes.JSONB,
            allowNull: true,
            comment: 'AutomationPausedReason; set when auto-paused, NULL otherwise',
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

      await queryInterface.addIndex('TransactionAutomations', ['userId', 'position'], { transaction });

      await queryInterface.sequelize.query(
        `ALTER TABLE "TransactionAutomations" ADD CONSTRAINT "TransactionAutomations_position_check"
         CHECK ("position" >= 0);`,
        { transaction },
      );
    });
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable('TransactionAutomations', { transaction });
    });
  },
};
