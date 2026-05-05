import { DataTypes, QueryInterface, Transaction } from 'sequelize';

const RESOURCE_TYPES = ['account'] as const;
const SHARE_PERMISSIONS = ['read', 'write', 'manage'] as const;
const INVITATION_STATUSES = ['pending', 'accepted', 'declined', 'revoked', 'expired'] as const;

const inClause = (values: readonly string[]) => values.map((v) => `'${v}'`).join(', ');

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.createTable(
        'ResourceShares',
        {
          id: {
            type: DataTypes.UUID,
            primaryKey: true,
            allowNull: false,
          },
          ownerUserId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'Users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          sharedWithUserId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'Users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          resourceType: {
            type: DataTypes.STRING(32),
            allowNull: false,
          },
          resourceId: {
            type: DataTypes.STRING(255),
            allowNull: false,
            comment: 'String-encoded id of the referenced resource (INTEGER ids stored as strings)',
          },
          permission: {
            type: DataTypes.STRING(32),
            allowNull: false,
          },
          policy: {
            type: DataTypes.JSONB,
            allowNull: true,
          },
          acceptedAt: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: 'When the recipient accepted the invitation; share is inactive until set',
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

      await queryInterface.createTable(
        'ShareInvitations',
        {
          id: {
            type: DataTypes.UUID,
            primaryKey: true,
            allowNull: false,
          },
          ownerUserId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'Users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          inviteeEmail: {
            type: DataTypes.STRING(320),
            allowNull: false,
          },
          inviteeUserId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'Users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          resourceType: {
            type: DataTypes.STRING(32),
            allowNull: false,
          },
          resourceId: {
            type: DataTypes.STRING(255),
            allowNull: false,
          },
          permission: {
            type: DataTypes.STRING(32),
            allowNull: false,
          },
          policy: {
            type: DataTypes.JSONB,
            allowNull: true,
          },
          token: {
            type: DataTypes.STRING(64),
            allowNull: false,
            unique: true,
          },
          status: {
            type: DataTypes.STRING(32),
            allowNull: false,
            defaultValue: 'pending',
          },
          expiresAt: {
            type: DataTypes.DATE,
            allowNull: false,
          },
          acceptedAt: {
            type: DataTypes.DATE,
            allowNull: true,
          },
          declinedAt: {
            type: DataTypes.DATE,
            allowNull: true,
          },
          revokedAt: {
            type: DataTypes.DATE,
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

      // CHECK constraints: domain enforcement at the DB level (VARCHAR + CHECK
      // is preferred over Postgres ENUM types so adding values in later phases
      // is a code-only change with no ALTER TYPE migration).
      await queryInterface.sequelize.query(
        `ALTER TABLE "ResourceShares" ADD CONSTRAINT "chk_resource_shares_resource_type"
         CHECK ("resourceType" IN (${inClause(RESOURCE_TYPES)}));`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "ResourceShares" ADD CONSTRAINT "chk_resource_shares_permission"
         CHECK ("permission" IN (${inClause(SHARE_PERMISSIONS)}));`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "ShareInvitations" ADD CONSTRAINT "chk_share_invitations_resource_type"
         CHECK ("resourceType" IN (${inClause(RESOURCE_TYPES)}));`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "ShareInvitations" ADD CONSTRAINT "chk_share_invitations_permission"
         CHECK ("permission" IN (${inClause(SHARE_PERMISSIONS)}));`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "ShareInvitations" ADD CONSTRAINT "chk_share_invitations_status"
         CHECK ("status" IN (${inClause(INVITATION_STATUSES)}));`,
        { transaction: t },
      );

      // ResourceShares indexes
      await queryInterface.addIndex('ResourceShares', ['resourceType', 'resourceId'], {
        name: 'resource_shares_resource_type_resource_id_idx',
        transaction: t,
      });
      await queryInterface.addIndex('ResourceShares', ['sharedWithUserId', 'resourceType'], {
        name: 'resource_shares_shared_with_user_id_resource_type_idx',
        transaction: t,
      });
      await queryInterface.addIndex('ResourceShares', ['ownerUserId', 'resourceType'], {
        name: 'resource_shares_owner_user_id_resource_type_idx',
        transaction: t,
      });
      await queryInterface.addConstraint('ResourceShares', {
        fields: ['sharedWithUserId', 'resourceType', 'resourceId'],
        type: 'unique',
        name: 'uq_resource_shares_recipient_resource',
        transaction: t,
      });

      // ShareInvitations indexes
      await queryInterface.addIndex('ShareInvitations', ['ownerUserId'], {
        name: 'share_invitations_owner_user_id_idx',
        transaction: t,
      });
      await queryInterface.addIndex('ShareInvitations', ['inviteeUserId'], {
        name: 'share_invitations_invitee_user_id_idx',
        transaction: t,
      });
      await queryInterface.addIndex('ShareInvitations', ['inviteeEmail'], {
        name: 'share_invitations_invitee_email_idx',
        transaction: t,
      });
      await queryInterface.addIndex('ShareInvitations', ['status', 'expiresAt'], {
        name: 'share_invitations_status_expires_at_idx',
        transaction: t,
      });
      await queryInterface.addIndex('ShareInvitations', ['resourceType', 'resourceId'], {
        name: 'share_invitations_resource_type_resource_id_idx',
        transaction: t,
      });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.dropTable('ShareInvitations', { transaction: t });
      await queryInterface.dropTable('ResourceShares', { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
