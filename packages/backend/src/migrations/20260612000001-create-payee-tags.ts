import { DataTypes, QueryInterface, Transaction } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // Per-Payee default tags. When a transaction gets linked to a Payee at
      // creation/sync time, these tags are auto-applied (unless the caller
      // supplied an explicit tag list). CASCADE on both FKs: deleting a tag
      // silently drops it from every Payee rule, deleting a Payee drops its
      // rule rows.
      await queryInterface.createTable(
        'PayeeTags',
        {
          payeeId: {
            type: DataTypes.UUID,
            allowNull: false,
            primaryKey: true,
            references: { model: 'Payees', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          tagId: {
            type: DataTypes.UUID,
            allowNull: false,
            primaryKey: true,
            references: { model: 'Tags', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
        },
        { transaction: t },
      );

      // Composite PK already covers payeeId-first lookups; tagId index covers
      // the FK cascade path on tag deletion.
      await queryInterface.addIndex('PayeeTags', ['tagId'], {
        name: 'payee_tags_tag_id_idx',
        transaction: t,
      });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.dropTable('PayeeTags');
  },
};
