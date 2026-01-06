/* eslint-disable @typescript-eslint/no-explicit-any */
import { AbstractQueryInterface, Transaction } from '@sequelize/core';

/**
 * Migration to create BankDataProviderConnections table and link it to Accounts.
 * This table stores connections to external bank data providers (Monobank, LunchFlow, etc.)
 * allowing users to connect multiple instances of the same provider.
 * Also adds bankDataProviderConnectionId to Accounts table to track which connection an account belongs to.
 */
module.exports = {
  up: async (queryInterface: AbstractQueryInterface, Sequelize: any): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      // Create BankDataProviderConnections table
      await queryInterface.createTable(
        'BankDataProviderConnections',
        {
          id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
          },
          userId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              table: 'Users',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          providerType: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: 'Type of provider: monobank, lunchflow, etc.',
          },
          providerName: {
            type: Sequelize.STRING(255),
            allowNull: false,
            comment: 'User-defined friendly name for this connection',
          },
          isActive: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
          },
          credentials: {
            type: Sequelize.JSONB,
            allowNull: false,
            comment: 'Encrypted provider-specific credentials (API keys, tokens, etc.)',
          },
          metadata: {
            type: Sequelize.JSONB,
            allowNull: true,
            comment: 'Provider-specific metadata (webhooks, client IDs, etc.)',
          },
          lastSyncAt: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: 'Timestamp of last successful sync',
          },
          createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
          },
          updatedAt: {
            type: Sequelize.DATE,
            allowNull: false,
          },
        },
        { transaction: t },
      );

      // Add indexes
      await queryInterface.addIndex('BankDataProviderConnections', ['userId'], {
        name: 'bank_data_provider_connections_user_id_idx',
        transaction: t,
      });

      await queryInterface.addIndex('BankDataProviderConnections', ['providerType'], {
        name: 'bank_data_provider_connections_provider_type_idx',
        transaction: t,
      });

      await queryInterface.addIndex('BankDataProviderConnections', ['userId', 'providerType'], {
        name: 'bank_data_provider_connections_user_provider_idx',
        transaction: t,
      });

      await queryInterface.addIndex('BankDataProviderConnections', ['isActive'], {
        name: 'bank_data_provider_connections_active_idx',
        where: { isActive: true },
        transaction: t,
      });

      // Add bankDataProviderConnectionId column to Accounts table
      await queryInterface.addColumn(
        'Accounts',
        'bankDataProviderConnectionId',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            table: 'BankDataProviderConnections',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        { transaction: t },
      );

      // Add index for the new foreign key
      await queryInterface.addIndex('Accounts', ['bankDataProviderConnectionId'], {
        name: 'accounts_bank_data_provider_connection_id_idx',
        transaction: t,
      });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      // Remove the index from Accounts first
      await queryInterface.removeIndex('Accounts', 'accounts_bank_data_provider_connection_id_idx', {
        transaction: t,
      });

      // Remove the column from Accounts
      await queryInterface.removeColumn('Accounts', 'bankDataProviderConnectionId', {
        transaction: t,
      });

      // Drop the BankDataProviderConnections table
      await queryInterface.dropTable('BankDataProviderConnections', { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
