'use strict';

import { DataTypes, QueryInterface } from 'sequelize';

/**
 * Migration to remove the old Monobank integration that used direct API tokens.
 *
 * This migration:
 * 1. Converts all old monobank accounts (type='monobank' AND bankDataProviderConnectionId IS NULL)
 *    to system accounts (type='system')
 * 2. Drops the MonobankUsers table which stored old API tokens
 *
 * The new Monobank integration uses BankDataProviderConnections and accounts with
 * bankDataProviderConnectionId set. Those accounts keep type='monobank'.
 */
module.exports = {
  async up(queryInterface: QueryInterface) {
    // Step 1: Convert old monobank accounts (without bankDataProviderConnectionId) to system accounts
    // Using hardcoded strings as migrations should be self-contained and not depend on app code
    await queryInterface.sequelize.query(`
      UPDATE "Accounts"
      SET type = 'system',
          "externalId" = NULL,
          "externalData" = NULL
      WHERE type = 'monobank'
        AND "bankDataProviderConnectionId" IS NULL
    `);

    // Step 2: Drop the MonobankUsers table (old integration)
    await queryInterface.dropTable('MonobankUsers');
  },

  async down(queryInterface: QueryInterface) {
    // Recreate MonobankUsers table
    await queryInterface.createTable('MonobankUsers', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      clientId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      webHookUrl: {
        type: DataTypes.STRING(1000),
        allowNull: true,
      },
      apiToken: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      systemUserId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id',
        },
        onDelete: 'CASCADE',
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
    });

    // Note: Cannot restore the original type='monobank' for accounts as we don't know which ones were converted
  },
};
