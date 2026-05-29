import { DataTypes, AbstractQueryInterface, QueryTypes, Transaction } from '@sequelize/core';

export default {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      // 1. Add bankDataProviderConnectionId column to AccountGroups
      await queryInterface.addColumn(
        'AccountGroups',
        'bankDataProviderConnectionId',
        {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: {
            table: 'BankDataProviderConnections',
            key: 'id',
          },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        },
        { transaction: t },
      );

      // 2. Create AccountGroups for existing bank connections and link ungrouped accounts
      const connections = await queryInterface.sequelize.query<{
        id: number;
        userId: number;
        providerName: string;
      }>('SELECT id, "userId", "providerName" FROM "BankDataProviderConnections"', {
        type: QueryTypes.SELECT,
        transaction: t,
      });

      for (const conn of connections) {
        // Create AccountGroup for this connection
        const [group] = await queryInterface.sequelize.query<{ id: number }>(
          `INSERT INTO "AccountGroups" ("userId", "name", "bankDataProviderConnectionId", "createdAt", "updatedAt")
           VALUES (:userId, :name, :connectionId, NOW(), NOW())
           RETURNING id`,
          {
            replacements: { userId: conn.userId, name: conn.providerName, connectionId: conn.id },
            type: QueryTypes.SELECT,
            transaction: t,
          },
        );

        if (!group) continue;

        // Find enabled accounts linked to this connection that are NOT already in any group
        const accounts = await queryInterface.sequelize.query<{ id: number }>(
          `SELECT a.id FROM "Accounts" a
           WHERE a."bankDataProviderConnectionId" = :connectionId
           AND a."isEnabled" = true
           AND NOT EXISTS (SELECT 1 FROM "AccountGroupings" ag WHERE ag."accountId" = a.id)`,
          {
            replacements: { connectionId: conn.id },
            type: QueryTypes.SELECT,
            transaction: t,
          },
        );

        for (const account of accounts) {
          await queryInterface.sequelize.query(
            `INSERT INTO "AccountGroupings" ("accountId", "groupId", "createdAt", "updatedAt")
             VALUES (:accountId, :groupId, NOW(), NOW())`,
            {
              replacements: { accountId: account.id, groupId: group.id },
              transaction: t,
            },
          );
        }
      }

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      // Delete AccountGroups that were created for bank connections
      // (their AccountGroupings will cascade-delete)
      await queryInterface.sequelize.query(
        'DELETE FROM "AccountGroups" WHERE "bankDataProviderConnectionId" IS NOT NULL',
        { transaction: t },
      );

      await queryInterface.removeColumn('AccountGroups', 'bankDataProviderConnectionId', {
        transaction: t,
      });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
