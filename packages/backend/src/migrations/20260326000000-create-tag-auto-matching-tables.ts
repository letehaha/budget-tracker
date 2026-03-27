import { DataTypes, QueryInterface, Transaction } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // 1. Create TagAutoMatchRules table
      await queryInterface.createTable(
        'TagAutoMatchRules',
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
          tagId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'Tags', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          type: {
            type: DataTypes.ENUM('code', 'ai'),
            allowNull: false,
          },
          isEnabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
          },
          approvalMode: {
            type: DataTypes.ENUM('auto', 'manual'),
            allowNull: false,
            defaultValue: 'auto',
          },
          codePattern: {
            type: DataTypes.STRING(500),
            allowNull: true,
          },
          aiPrompt: {
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

      // CHECK: codePattern required for 'code' type, aiPrompt required for 'ai' type
      await queryInterface.sequelize.query(
        `ALTER TABLE "TagAutoMatchRules" ADD CONSTRAINT "chk_tag_rule_code_pattern"
         CHECK ("type" != 'code' OR "codePattern" IS NOT NULL);`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE "TagAutoMatchRules" ADD CONSTRAINT "chk_tag_rule_ai_prompt"
         CHECK ("type" != 'ai' OR "aiPrompt" IS NOT NULL);`,
        { transaction: t },
      );

      // Indexes for TagAutoMatchRules
      await queryInterface.addIndex('TagAutoMatchRules', ['userId', 'isEnabled'], {
        name: 'tag_auto_match_rules_user_enabled_idx',
        transaction: t,
      });

      await queryInterface.addIndex('TagAutoMatchRules', ['tagId'], {
        name: 'tag_auto_match_rules_tag_id_idx',
        transaction: t,
      });

      // 2. Create TagSuggestions table
      await queryInterface.createTable(
        'TagSuggestions',
        {
          userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            references: { model: 'Users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          transactionId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            references: { model: 'Transactions', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          tagId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            references: { model: 'Tags', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          ruleId: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'TagAutoMatchRules', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          source: {
            type: DataTypes.ENUM('code', 'ai'),
            allowNull: false,
          },
          createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
          },
        },
        { transaction: t },
      );

      // Indexes for TagSuggestions
      await queryInterface.addIndex('TagSuggestions', ['userId'], {
        name: 'tag_suggestions_user_id_idx',
        transaction: t,
      });

      await queryInterface.addIndex('TagSuggestions', ['transactionId'], {
        name: 'tag_suggestions_transaction_id_idx',
        transaction: t,
      });

      // 3. Create TagSuggestionDismissals table
      await queryInterface.createTable(
        'TagSuggestionDismissals',
        {
          userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            references: { model: 'Users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          transactionId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            references: { model: 'Transactions', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          tagId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            references: { model: 'Tags', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
          },
        },
        { transaction: t },
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.dropTable('TagSuggestionDismissals', { transaction: t });
      await queryInterface.dropTable('TagSuggestions', { transaction: t });
      await queryInterface.dropTable('TagAutoMatchRules', { transaction: t });

      // Drop ENUM types
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_TagAutoMatchRules_type";', { transaction: t });
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_TagAutoMatchRules_approvalMode";', {
        transaction: t,
      });
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_TagSuggestions_source";', { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
