import { DataTypes, AbstractQueryInterface, Transaction } from '@sequelize/core';

/**
 * Migration to create better-auth tables.
 * All tables use ba_ prefix to avoid conflicts with existing tables.
 */
module.exports = {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      // Create ba_user table
      await queryInterface.createTable(
        'ba_user',
        {
          id: {
            type: DataTypes.TEXT,
            primaryKey: true,
            allowNull: false,
          },
          name: {
            type: DataTypes.TEXT,
            allowNull: false,
          },
          email: {
            type: DataTypes.TEXT,
            allowNull: false,
            unique: true,
          },
          emailVerified: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          image: {
            type: DataTypes.TEXT,
            allowNull: true,
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
        { transaction: t },
      );

      // Create ba_session table
      await queryInterface.createTable(
        'ba_session',
        {
          id: {
            type: DataTypes.TEXT,
            primaryKey: true,
            allowNull: false,
          },
          userId: {
            type: DataTypes.TEXT,
            allowNull: false,
            references: {
              table: 'ba_user',
              key: 'id',
            },
            onDelete: 'CASCADE',
          },
          token: {
            type: DataTypes.TEXT,
            allowNull: false,
            unique: true,
          },
          expiresAt: {
            type: DataTypes.DATE,
            allowNull: false,
          },
          ipAddress: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          userAgent: {
            type: DataTypes.TEXT,
            allowNull: true,
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
        { transaction: t },
      );

      // Create ba_account table
      await queryInterface.createTable(
        'ba_account',
        {
          id: {
            type: DataTypes.TEXT,
            primaryKey: true,
            allowNull: false,
          },
          userId: {
            type: DataTypes.TEXT,
            allowNull: false,
            references: {
              table: 'ba_user',
              key: 'id',
            },
            onDelete: 'CASCADE',
          },
          accountId: {
            type: DataTypes.TEXT,
            allowNull: false,
          },
          providerId: {
            type: DataTypes.TEXT,
            allowNull: false,
          },
          accessToken: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          refreshToken: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          accessTokenExpiresAt: {
            type: DataTypes.DATE,
            allowNull: true,
          },
          refreshTokenExpiresAt: {
            type: DataTypes.DATE,
            allowNull: true,
          },
          idToken: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          scope: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          password: {
            type: DataTypes.TEXT,
            allowNull: true,
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
        { transaction: t },
      );

      // Create ba_verification table
      await queryInterface.createTable(
        'ba_verification',
        {
          id: {
            type: DataTypes.TEXT,
            primaryKey: true,
            allowNull: false,
          },
          identifier: {
            type: DataTypes.TEXT,
            allowNull: false,
          },
          value: {
            type: DataTypes.TEXT,
            allowNull: false,
          },
          expiresAt: {
            type: DataTypes.DATE,
            allowNull: false,
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
        { transaction: t },
      );

      // Create ba_passkey table (for passkey plugin)
      await queryInterface.createTable(
        'ba_passkey',
        {
          id: {
            type: DataTypes.TEXT,
            primaryKey: true,
            allowNull: false,
          },
          name: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          publicKey: {
            type: DataTypes.TEXT,
            allowNull: false,
          },
          userId: {
            type: DataTypes.TEXT,
            allowNull: false,
            references: {
              table: 'ba_user',
              key: 'id',
            },
            onDelete: 'CASCADE',
          },
          credentialID: {
            type: DataTypes.TEXT,
            allowNull: false,
          },
          counter: {
            type: DataTypes.INTEGER,
            allowNull: false,
          },
          deviceType: {
            type: DataTypes.TEXT,
            allowNull: false,
          },
          backedUp: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
          },
          transports: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          aaguid: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
          },
        },
        { transaction: t },
      );

      // Add indexes
      await queryInterface.addIndex('ba_session', ['userId'], {
        name: 'ba_session_userId',
        transaction: t,
      });
      await queryInterface.addIndex('ba_session', ['token'], {
        name: 'ba_session_token',
        transaction: t,
      });
      await queryInterface.addIndex('ba_account', ['userId'], {
        name: 'ba_account_userId',
        transaction: t,
      });
      await queryInterface.addIndex('ba_account', ['providerId', 'accountId'], {
        name: 'ba_account_providerId_accountId',
        transaction: t,
      });
      await queryInterface.addIndex('ba_passkey', ['userId'], {
        name: 'ba_passkey_userId',
        transaction: t,
      });
      await queryInterface.addIndex('ba_passkey', ['credentialID'], {
        name: 'ba_passkey_credentialID',
        transaction: t,
      });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  down: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      await queryInterface.dropTable('ba_passkey', { transaction: t });
      await queryInterface.dropTable('ba_verification', { transaction: t });
      await queryInterface.dropTable('ba_account', { transaction: t });
      await queryInterface.dropTable('ba_session', { transaction: t });
      await queryInterface.dropTable('ba_user', { transaction: t });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
