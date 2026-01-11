import { DataTypes, QueryInterface, QueryTypes, Transaction } from 'sequelize';

import { DEFAULT_TAG_KEYS, DEFAULT_TAG_STRUCTURE } from '../common/const/default-tags';

/**
 * Migration to create Tags and TransactionTags tables.
 * Tags allow users to categorize transactions with custom labels.
 * TransactionTags is a junction table for the many-to-many relationship.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // Create Tags table
      await queryInterface.createTable(
        'Tags',
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
            references: {
              model: 'Users',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          name: {
            type: DataTypes.STRING(100),
            allowNull: false,
          },
          color: {
            type: DataTypes.STRING(7),
            allowNull: false,
          },
          icon: {
            type: DataTypes.STRING(50),
            allowNull: true,
          },
          description: {
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

      // Unique constraint on (userId, name) to prevent duplicate tag names per user
      await queryInterface.addConstraint('Tags', {
        fields: ['userId', 'name'],
        type: 'unique',
        name: 'tags_user_name_unique',
        transaction: t,
      });

      // Index for listing tags by user
      await queryInterface.addIndex('Tags', ['userId'], {
        name: 'tags_user_id_idx',
        transaction: t,
      });

      // Create TransactionTags junction table
      await queryInterface.createTable(
        'TransactionTags',
        {
          tagId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
              model: 'Tags',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          transactionId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
              model: 'Transactions',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
        },
        { transaction: t },
      );

      // Composite primary key for the junction table
      await queryInterface.addConstraint('TransactionTags', {
        fields: ['tagId', 'transactionId'],
        type: 'primary key',
        name: 'transaction_tags_pkey',
        transaction: t,
      });

      // Index for efficient lookup by transactionId (reverse direction)
      await queryInterface.addIndex('TransactionTags', ['transactionId'], {
        name: 'transaction_tags_transaction_id_idx',
        transaction: t,
      });

      const wantTag = DEFAULT_TAG_STRUCTURE.find((i) => i.key === DEFAULT_TAG_KEYS.want)!;
      const needTag = DEFAULT_TAG_STRUCTURE.find((i) => i.key === DEFAULT_TAG_KEYS.need)!;
      const mustTag = DEFAULT_TAG_STRUCTURE.find((i) => i.key === DEFAULT_TAG_KEYS.must)!;

      // Seed default tags for all existing users
      const defaultTags = [
        {
          name: 'Want',
          color: wantTag.color,
          icon: wantTag.icon,
          description: 'Nice-to-have purchases and discretionary spending',
        },
        {
          name: 'Need',
          color: needTag.color,
          icon: needTag.icon,
          description: 'Important but not urgent expenses',
        },
        {
          name: 'Must',
          color: mustTag.color,
          icon: mustTag.icon,
          description: 'Essential expenses that cannot be avoided',
        },
      ];

      const users = await queryInterface.sequelize.query<{ id: number }>('SELECT id FROM "Users"', {
        type: QueryTypes.SELECT,
        transaction: t,
      });

      if (users && users.length > 0) {
        const now = new Date();
        const tagInserts = users.flatMap((user) =>
          defaultTags.map((tag) => ({
            userId: user.id,
            name: tag.name,
            color: tag.color,
            icon: tag.icon,
            description: tag.description,
            createdAt: now,
          })),
        );

        await queryInterface.bulkInsert('Tags', tagInserts, { transaction: t });
      }

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // Drop TransactionTags first (depends on Tags)
      const transactionTagsExists = await queryInterface.tableExists('TransactionTags');
      if (transactionTagsExists) {
        await queryInterface.removeConstraint('TransactionTags', 'transaction_tags_pkey', {
          transaction: t,
        });
        await queryInterface.dropTable('TransactionTags', { transaction: t });
      }

      // Drop Tags table
      const tagsExists = await queryInterface.tableExists('Tags');
      if (tagsExists) {
        await queryInterface.removeConstraint('Tags', 'tags_user_name_unique', { transaction: t });
        await queryInterface.dropTable('Tags', { transaction: t });
      }

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
