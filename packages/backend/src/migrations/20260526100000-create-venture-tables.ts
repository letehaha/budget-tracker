import { DataTypes, QueryInterface, Transaction } from 'sequelize';

/**
 * Venture investment tracking module — initial schema.
 *
 * Four tables:
 *   - VenturePlatforms (paranoid soft-delete) — user-curated GP/syndicate w/ default fees
 *   - VentureDeals (paranoid soft-delete) — single deal/SPV
 *   - VentureEvents (hard-delete; cascades on deal delete) — cash + valuation events
 *   - VentureEventLinks (hard-delete) — many-to-many event ↔ Transaction
 *
 * Reminder hooks reserved (no impl in v1): VentureDeal.expectedExitDate +
 * VentureDeal.metaData JSONB are anchors for a future VentureReminder feature.
 *
 * Enums stored as VARCHAR + CHECK constraints (no Postgres ENUM types) so
 * adding values later is a code-only change.
 */

const VEHICLE_TYPES = ['spv'] as const;
const SPV_SUBTYPES = ['single_company', 'multi_company'] as const;
const DEAL_STATUSES = ['outstanding', 'partial_exit', 'fully_exited', 'written_off'] as const;
const EVENT_TYPES = [
  'initial_investment',
  'capital_call',
  'distribution',
  'nav_update',
  'exit',
  'writedown',
  'fee_payment',
] as const;
const CASH_FLOW_MODES = ['linked', 'out_of_wallet', 'none'] as const;

const inClause = (values: readonly string[]) => values.map((v) => `'${v}'`).join(', ');

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // VenturePlatforms
      await queryInterface.createTable(
        'VenturePlatforms',
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
            type: DataTypes.STRING(255),
            allowNull: false,
          },
          website: {
            type: DataTypes.STRING(2000),
            allowNull: true,
          },
          description: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          defaultEntryFeePct: {
            type: DataTypes.DECIMAL(10, 6),
            allowNull: false,
            defaultValue: '0',
          },
          defaultMgmtFeePct: {
            type: DataTypes.DECIMAL(10, 6),
            allowNull: false,
            defaultValue: '0',
          },
          defaultCarryPct: {
            type: DataTypes.DECIMAL(10, 6),
            allowNull: false,
            defaultValue: '0',
          },
          defaultHurdlePct: {
            type: DataTypes.DECIMAL(10, 6),
            allowNull: false,
            defaultValue: '0',
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
          deletedAt: {
            type: DataTypes.DATE,
            allowNull: true,
          },
        },
        { transaction: t },
      );

      await queryInterface.addIndex('VenturePlatforms', ['userId'], {
        name: 'venture_platforms_user_id_idx',
        transaction: t,
      });
      await queryInterface.addIndex('VenturePlatforms', ['deletedAt'], {
        name: 'venture_platforms_deleted_at_idx',
        transaction: t,
      });
      // Unique platform name per user, only for non-deleted rows
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX "venture_platforms_user_name_unique"
         ON "VenturePlatforms" ("userId", "name") WHERE "deletedAt" IS NULL;`,
        { transaction: t },
      );

      // VentureDeals
      await queryInterface.createTable(
        'VentureDeals',
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
          platformId: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'VenturePlatforms', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          name: {
            type: DataTypes.STRING(255),
            allowNull: false,
          },
          vehicleType: {
            type: DataTypes.STRING(32),
            allowNull: false,
            defaultValue: 'spv',
          },
          spvSubtype: {
            type: DataTypes.STRING(32),
            allowNull: true,
          },
          targetCompany: {
            type: DataTypes.STRING(255),
            allowNull: true,
          },
          currencyCode: {
            type: DataTypes.STRING(3),
            allowNull: false,
            references: { model: 'Currencies', key: 'code' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
          },
          status: {
            type: DataTypes.STRING(32),
            allowNull: false,
            defaultValue: 'outstanding',
          },
          principal: {
            type: DataTypes.DECIMAL(20, 10),
            allowNull: false,
            defaultValue: '0',
          },
          entryFee: {
            type: DataTypes.DECIMAL(20, 10),
            allowNull: false,
            defaultValue: '0',
          },
          entryFeePct: {
            type: DataTypes.DECIMAL(10, 6),
            allowNull: false,
            defaultValue: '0',
          },
          mgmtFeePct: {
            type: DataTypes.DECIMAL(10, 6),
            allowNull: false,
            defaultValue: '0',
          },
          carryPct: {
            type: DataTypes.DECIMAL(10, 6),
            allowNull: false,
            defaultValue: '0',
          },
          hurdlePct: {
            type: DataTypes.DECIMAL(10, 6),
            allowNull: false,
            defaultValue: '0',
          },
          investmentDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
          },
          expectedExitDate: {
            type: DataTypes.DATEONLY,
            allowNull: true,
          },
          notes: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          metaData: {
            type: DataTypes.JSONB,
            allowNull: true,
            defaultValue: null,
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
          deletedAt: {
            type: DataTypes.DATE,
            allowNull: true,
          },
        },
        { transaction: t },
      );

      await queryInterface.addIndex('VentureDeals', ['userId'], {
        name: 'venture_deals_user_id_idx',
        transaction: t,
      });
      await queryInterface.addIndex('VentureDeals', ['platformId'], {
        name: 'venture_deals_platform_id_idx',
        transaction: t,
      });
      await queryInterface.addIndex('VentureDeals', ['currencyCode'], {
        name: 'venture_deals_currency_code_idx',
        transaction: t,
      });
      await queryInterface.addIndex('VentureDeals', ['status'], {
        name: 'venture_deals_status_idx',
        transaction: t,
      });
      await queryInterface.addIndex('VentureDeals', ['investmentDate'], {
        name: 'venture_deals_investment_date_idx',
        transaction: t,
      });
      await queryInterface.addIndex('VentureDeals', ['deletedAt'], {
        name: 'venture_deals_deleted_at_idx',
        transaction: t,
      });

      // CHECK constraints on VentureDeals
      await queryInterface.sequelize.query(
        `ALTER TABLE "VentureDeals" ADD CONSTRAINT "chk_venture_deals_vehicle_type"
         CHECK ("vehicleType" IN (${inClause(VEHICLE_TYPES)}));`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "VentureDeals" ADD CONSTRAINT "chk_venture_deals_spv_subtype"
         CHECK ("spvSubtype" IS NULL OR "spvSubtype" IN (${inClause(SPV_SUBTYPES)}));`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "VentureDeals" ADD CONSTRAINT "chk_venture_deals_status"
         CHECK ("status" IN (${inClause(DEAL_STATUSES)}));`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "VentureDeals" ADD CONSTRAINT "chk_venture_deals_principal_non_negative"
         CHECK ("principal" >= 0);`,
        { transaction: t },
      );

      // VentureEvents
      await queryInterface.createTable(
        'VentureEvents',
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
          dealId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'VentureDeals', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          type: {
            type: DataTypes.STRING(32),
            allowNull: false,
          },
          eventDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
          },
          grossAmount: {
            type: DataTypes.DECIMAL(20, 10),
            allowNull: true,
          },
          gpCarryAmount: {
            type: DataTypes.DECIMAL(20, 10),
            allowNull: true,
          },
          lpNetAmount: {
            type: DataTypes.DECIMAL(20, 10),
            allowNull: true,
          },
          refAmount: {
            type: DataTypes.DECIMAL(20, 10),
            allowNull: true,
          },
          navAfter: {
            type: DataTypes.DECIMAL(20, 10),
            allowNull: true,
          },
          quantityPct: {
            type: DataTypes.DECIMAL(10, 6),
            allowNull: true,
          },
          lpNetAmountOverridden: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          gpCarryOverridden: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          principalReturnedThisEvent: {
            type: DataTypes.DECIMAL(20, 10),
            allowNull: true,
          },
          currencyCode: {
            type: DataTypes.STRING(3),
            allowNull: false,
            references: { model: 'Currencies', key: 'code' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
          },
          cashFlowMode: {
            type: DataTypes.STRING(32),
            allowNull: false,
            defaultValue: 'none',
          },
          notes: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          metaData: {
            type: DataTypes.JSONB,
            allowNull: true,
            defaultValue: null,
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

      await queryInterface.addIndex('VentureEvents', ['userId'], {
        name: 'venture_events_user_id_idx',
        transaction: t,
      });
      await queryInterface.addIndex('VentureEvents', ['dealId'], {
        name: 'venture_events_deal_id_idx',
        transaction: t,
      });
      await queryInterface.addIndex('VentureEvents', ['type'], {
        name: 'venture_events_type_idx',
        transaction: t,
      });
      await queryInterface.addIndex('VentureEvents', ['eventDate'], {
        name: 'venture_events_event_date_idx',
        transaction: t,
      });
      await queryInterface.addIndex('VentureEvents', ['currencyCode'], {
        name: 'venture_events_currency_code_idx',
        transaction: t,
      });
      // Composite idx — v2 reminder cadence prediction hook
      await queryInterface.addIndex('VentureEvents', ['dealId', 'eventDate'], {
        name: 'venture_events_deal_event_date_idx',
        transaction: t,
      });
      // At most one initial_investment per deal
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX "venture_events_one_initial_investment_per_deal"
         ON "VentureEvents" ("dealId") WHERE "type" = 'initial_investment';`,
        { transaction: t },
      );

      // CHECK constraints on VentureEvents
      await queryInterface.sequelize.query(
        `ALTER TABLE "VentureEvents" ADD CONSTRAINT "chk_venture_events_type"
         CHECK ("type" IN (${inClause(EVENT_TYPES)}));`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "VentureEvents" ADD CONSTRAINT "chk_venture_events_cash_flow_mode"
         CHECK ("cashFlowMode" IN (${inClause(CASH_FLOW_MODES)}));`,
        { transaction: t },
      );
      // Carry only for distribution/exit
      await queryInterface.sequelize.query(
        `ALTER TABLE "VentureEvents" ADD CONSTRAINT "chk_venture_events_carry_only_for_exit_or_dist"
         CHECK (
           "gpCarryAmount" IS NULL OR "type" IN ('distribution', 'exit')
         );`,
        { transaction: t },
      );
      // nav_update / writedown → cashFlowMode='none', lpNetAmount NULL
      await queryInterface.sequelize.query(
        `ALTER TABLE "VentureEvents" ADD CONSTRAINT "chk_venture_events_nav_only_no_cash"
         CHECK (
           "type" NOT IN ('nav_update', 'writedown')
           OR ("cashFlowMode" = 'none' AND "lpNetAmount" IS NULL)
         );`,
        { transaction: t },
      );

      // VentureEventLinks
      await queryInterface.createTable(
        'VentureEventLinks',
        {
          id: {
            type: DataTypes.UUID,
            primaryKey: true,
            allowNull: false,
          },
          ventureEventId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'VentureEvents', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          transactionId: {
            type: DataTypes.UUID,
            allowNull: false,
            unique: true,
            references: { model: 'Transactions', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          amount: {
            type: DataTypes.DECIMAL(20, 10),
            allowNull: false,
          },
          currencyCode: {
            type: DataTypes.STRING(3),
            allowNull: false,
            references: { model: 'Currencies', key: 'code' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
          },
          linkedAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
          },
          metaData: {
            type: DataTypes.JSONB,
            allowNull: true,
            defaultValue: null,
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

      await queryInterface.addIndex('VentureEventLinks', ['ventureEventId'], {
        name: 'venture_event_links_event_id_idx',
        transaction: t,
      });
      await queryInterface.addIndex('VentureEventLinks', ['transactionId'], {
        name: 'venture_event_links_transaction_id_idx',
        transaction: t,
        unique: true,
      });
      await queryInterface.addIndex('VentureEventLinks', ['currencyCode'], {
        name: 'venture_event_links_currency_code_idx',
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
      await queryInterface.dropTable('VentureEventLinks', { transaction: t });
      await queryInterface.dropTable('VentureEvents', { transaction: t });
      await queryInterface.dropTable('VentureDeals', { transaction: t });
      await queryInterface.dropTable('VenturePlatforms', { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
