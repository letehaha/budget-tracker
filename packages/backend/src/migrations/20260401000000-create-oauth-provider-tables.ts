import { DataTypes, AbstractQueryInterface, Transaction } from '@sequelize/core';

/**
 * Migration to create OAuth 2.0 provider tables for better-auth oauth-provider plugin.
 * Used for MCP server authentication (Claude.ai, ChatGPT, etc.).
 * All tables use ba_ prefix consistent with other better-auth tables.
 */
export default {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      // Create jwks table (required by better-auth jwt() plugin for signing OAuth tokens)
      await queryInterface.createTable(
        'ba_jwks',
        {
          id: {
            type: DataTypes.TEXT,
            primaryKey: true,
            allowNull: false,
          },
          publicKey: {
            type: DataTypes.TEXT,
            allowNull: false,
          },
          privateKey: {
            type: DataTypes.TEXT,
            allowNull: false,
          },
          createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
          },
          expiresAt: {
            type: DataTypes.DATE,
            allowNull: true,
          },
        },
        { transaction: t },
      );

      // Create ba_oauth_client table
      await queryInterface.createTable(
        'ba_oauth_client',
        {
          id: {
            type: DataTypes.TEXT,
            primaryKey: true,
            allowNull: false,
          },
          clientId: {
            type: DataTypes.TEXT,
            allowNull: false,
            unique: true,
          },
          clientSecret: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          name: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          uri: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          icon: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          redirectUris: {
            type: DataTypes.TEXT,
            allowNull: false,
          },
          type: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          public: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
          },
          disabled: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
            defaultValue: false,
          },
          skipConsent: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
          },
          enableEndSession: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
          },
          subjectType: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          scopes: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          contacts: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          tos: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          policy: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          softwareId: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          softwareVersion: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          softwareStatement: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          postLogoutRedirectUris: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          tokenEndpointAuthMethod: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          grantTypes: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          responseTypes: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          requirePKCE: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
          },
          referenceId: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          metadata: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          userId: {
            type: DataTypes.TEXT,
            allowNull: true,
            references: {
              table: 'ba_user',
              key: 'id',
            },
            onDelete: 'SET NULL',
          },
          createdAt: {
            type: DataTypes.DATE,
            allowNull: true,
          },
          updatedAt: {
            type: DataTypes.DATE,
            allowNull: true,
          },
        },
        { transaction: t },
      );

      await queryInterface.addIndex('ba_oauth_client', ['clientId'], {
        name: 'ba_oauth_client_client_id_idx',
        unique: true,
        transaction: t,
      });

      // Create ba_oauth_access_token table
      await queryInterface.createTable(
        'ba_oauth_access_token',
        {
          id: {
            type: DataTypes.TEXT,
            primaryKey: true,
            allowNull: false,
          },
          token: {
            type: DataTypes.TEXT,
            allowNull: true,
            unique: true,
          },
          clientId: {
            type: DataTypes.TEXT,
            allowNull: false,
          },
          userId: {
            type: DataTypes.TEXT,
            allowNull: true,
            references: {
              table: 'ba_user',
              key: 'id',
            },
            onDelete: 'CASCADE',
          },
          sessionId: {
            type: DataTypes.TEXT,
            allowNull: true,
            references: {
              table: 'ba_session',
              key: 'id',
            },
            onDelete: 'SET NULL',
          },
          refreshId: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          referenceId: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          scopes: {
            type: DataTypes.TEXT,
            allowNull: false,
          },
          expiresAt: {
            type: DataTypes.DATE,
            allowNull: true,
          },
          createdAt: {
            type: DataTypes.DATE,
            allowNull: true,
          },
        },
        { transaction: t },
      );

      await queryInterface.addIndex('ba_oauth_access_token', ['token'], {
        name: 'ba_oauth_access_token_token_idx',
        unique: true,
        transaction: t,
      });

      await queryInterface.addIndex('ba_oauth_access_token', ['userId'], {
        name: 'ba_oauth_access_token_user_id_idx',
        transaction: t,
      });

      await queryInterface.addIndex('ba_oauth_access_token', ['clientId'], {
        name: 'ba_oauth_access_token_client_id_idx',
        transaction: t,
      });

      // Create ba_oauth_refresh_token table
      await queryInterface.createTable(
        'ba_oauth_refresh_token',
        {
          id: {
            type: DataTypes.TEXT,
            primaryKey: true,
            allowNull: false,
          },
          token: {
            type: DataTypes.TEXT,
            allowNull: false,
          },
          clientId: {
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
          sessionId: {
            type: DataTypes.TEXT,
            allowNull: true,
            references: {
              table: 'ba_session',
              key: 'id',
            },
            onDelete: 'SET NULL',
          },
          referenceId: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          scopes: {
            type: DataTypes.TEXT,
            allowNull: false,
          },
          expiresAt: {
            type: DataTypes.DATE,
            allowNull: true,
          },
          createdAt: {
            type: DataTypes.DATE,
            allowNull: true,
          },
          revoked: {
            type: DataTypes.DATE,
            allowNull: true,
          },
          authTime: {
            type: DataTypes.DATE,
            allowNull: true,
          },
        },
        { transaction: t },
      );

      await queryInterface.addIndex('ba_oauth_refresh_token', ['userId'], {
        name: 'ba_oauth_refresh_token_user_id_idx',
        transaction: t,
      });

      await queryInterface.addIndex('ba_oauth_refresh_token', ['clientId'], {
        name: 'ba_oauth_refresh_token_client_id_idx',
        transaction: t,
      });

      // Create ba_oauth_consent table
      await queryInterface.createTable(
        'ba_oauth_consent',
        {
          id: {
            type: DataTypes.TEXT,
            primaryKey: true,
            allowNull: false,
          },
          clientId: {
            type: DataTypes.TEXT,
            allowNull: false,
          },
          userId: {
            type: DataTypes.TEXT,
            allowNull: true,
            references: {
              table: 'ba_user',
              key: 'id',
            },
            onDelete: 'CASCADE',
          },
          referenceId: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          scopes: {
            type: DataTypes.TEXT,
            allowNull: false,
          },
          createdAt: {
            type: DataTypes.DATE,
            allowNull: true,
          },
          updatedAt: {
            type: DataTypes.DATE,
            allowNull: true,
          },
        },
        { transaction: t },
      );

      await queryInterface.addIndex('ba_oauth_consent', ['userId', 'clientId'], {
        name: 'ba_oauth_consent_user_client_idx',
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
      await queryInterface.dropTable('ba_oauth_consent', { transaction: t });
      await queryInterface.dropTable('ba_oauth_refresh_token', { transaction: t });
      await queryInterface.dropTable('ba_oauth_access_token', { transaction: t });
      await queryInterface.dropTable('ba_oauth_client', { transaction: t });
      await queryInterface.dropTable('ba_jwks', { transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
