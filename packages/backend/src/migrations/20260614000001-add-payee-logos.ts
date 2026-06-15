import { DataTypes, QueryInterface, Transaction } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // Resolved brand domain for this Payee (e.g. "amazon.com"). Null until
      // the resolver has matched the Payee against BrandLogos.
      await queryInterface.addColumn(
        'Payees',
        'logoDomain',
        {
          type: DataTypes.STRING(253),
          allowNull: true,
        },
        { transaction: t },
      );

      // VARCHAR + TS-side union (project convention: no DB enums). 'auto' =
      // system-resolved via BrandLogos; 'manual' = user override (logoDomain
      // may be null if the user cleared the logo). Null only before the Payee
      // has been through a resolution pass.
      await queryInterface.addColumn(
        'Payees',
        'logoSource',
        {
          type: DataTypes.STRING(16),
          allowNull: true,
        },
        { transaction: t },
      );

      // Global shared cache: normalizedMerchantName → brand domain. Populated
      // by the brand-resolver service and optional seeders. Shared across all
      // users — no userId column.
      await queryInterface.createTable(
        'BrandLogos',
        {
          id: {
            type: DataTypes.UUID,
            primaryKey: true,
            allowNull: false,
          },
          normalizedName: {
            type: DataTypes.STRING(200),
            allowNull: false,
          },
          domain: {
            type: DataTypes.STRING(253),
            allowNull: false,
          },
          brandName: {
            type: DataTypes.STRING(200),
            allowNull: true,
          },
          // VARCHAR + TS-side union. Tracks which external provider supplied
          // this mapping so stale entries can be re-fetched selectively.
          source: {
            type: DataTypes.STRING(16),
            allowNull: false,
            defaultValue: 'logodev',
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

      // Unique: one canonical domain per normalized merchant name.
      await queryInterface.addIndex('BrandLogos', ['normalizedName'], {
        name: 'brand_logos_normalized_name_uniq',
        unique: true,
        transaction: t,
      });

      // Non-unique: allows reverse lookup (domain → all brand names that map
      // to it) used by the admin seeder and dedup checks.
      await queryInterface.addIndex('BrandLogos', ['domain'], {
        name: 'brand_logos_domain_idx',
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
      await queryInterface.dropTable('BrandLogos', { transaction: t });
      await queryInterface.removeColumn('Payees', 'logoSource', { transaction: t });
      await queryInterface.removeColumn('Payees', 'logoDomain', { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
