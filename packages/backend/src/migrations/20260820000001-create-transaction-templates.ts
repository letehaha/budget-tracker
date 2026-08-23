import { DataTypes, QueryInterface, Transaction } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.createTable(
        'TransactionTemplates',
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
            type: DataTypes.STRING(100),
            allowNull: false,
          },
          transactionType: {
            type: DataTypes.STRING(50),
            allowNull: false,
          },
          amount: {
            type: DataTypes.BIGINT,
            allowNull: true,
            comment: 'Amount in cents; null means the user enters it each time',
          },
          accountId: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'Accounts', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          categoryId: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'Categories', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          payeeId: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'Payees', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          paymentType: {
            type: DataTypes.STRING(50),
            allowNull: true,
          },
          note: {
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

      await queryInterface.addIndex('TransactionTemplates', ['userId'], { transaction: t });

      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX "TransactionTemplates_userId_name_unique" ON "TransactionTemplates" ("userId", lower(btrim("name")));`,
        { transaction: t },
      );

      await queryInterface.createTable(
        'TransactionTemplateTags',
        {
          templateId: {
            type: DataTypes.UUID,
            primaryKey: true,
            allowNull: false,
            references: { model: 'TransactionTemplates', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          tagId: {
            type: DataTypes.UUID,
            primaryKey: true,
            allowNull: false,
            references: { model: 'Tags', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
        },
        { transaction: t },
      );

      // Composite PK already covers templateId-first lookups; the tagId index
      // covers the FK cascade path on tag deletion.
      await queryInterface.addIndex('TransactionTemplateTags', ['tagId'], {
        name: 'transaction_template_tags_tag_id_idx',
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
      await queryInterface.dropTable('TransactionTemplateTags', { transaction: t });
      await queryInterface.dropTable('TransactionTemplates', { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
