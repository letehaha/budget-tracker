import { DataTypes, QueryInterface } from 'sequelize';

/**
 * `TransactionAttachments` — receipt/document files attached to a transaction.
 *
 * No storage-key column: the blob path is derived as `${userId}/${id}`. `userId`
 * is the uploader, whose storage quota the row counts against.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'TransactionAttachments',
        {
          id: {
            type: DataTypes.UUID,
            primaryKey: true,
            allowNull: false,
          },
          transactionId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'Transactions', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'Users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          filename: {
            type: DataTypes.STRING(255),
            allowNull: false,
          },
          mimeType: {
            type: DataTypes.STRING(100),
            allowNull: false,
          },
          size: {
            type: DataTypes.INTEGER,
            allowNull: false,
          },
          createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
          },
        },
        { transaction },
      );

      await queryInterface.addIndex('TransactionAttachments', ['transactionId'], { transaction });
      await queryInterface.addIndex('TransactionAttachments', ['userId'], { transaction });
    });
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable('TransactionAttachments', { transaction });
    });
  },
};
