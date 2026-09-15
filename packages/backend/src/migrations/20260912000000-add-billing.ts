import { DataTypes, QueryInterface, Transaction } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.addColumn(
        'Users',
        'plan',
        { type: DataTypes.STRING(20), allowNull: true },
        { transaction: t },
      );
      await queryInterface.addColumn(
        'Users',
        'trialEndsAt',
        { type: DataTypes.DATE, allowNull: true },
        { transaction: t },
      );

      await queryInterface.createTable(
        'BillingSubscriptions',
        {
          id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
          userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'Users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          externalSubscriptionId: { type: DataTypes.STRING, allowNull: false },
          externalCustomerId: { type: DataTypes.STRING, allowNull: false },
          status: { type: DataTypes.STRING(20), allowNull: false },
          tier: { type: DataTypes.STRING(20), allowNull: false },
          billingCycle: { type: DataTypes.STRING(10), allowNull: false },
          currentPeriodEndsAt: { type: DataTypes.DATE, allowNull: false },
          scheduledChange: { type: DataTypes.JSONB, allowNull: true },
          providerUpdatedAt: { type: DataTypes.DATE, allowNull: false },
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
      await queryInterface.addIndex('BillingSubscriptions', ['externalSubscriptionId'], {
        unique: true,
        transaction: t,
      });
      await queryInterface.addIndex('BillingSubscriptions', ['userId'], {
        transaction: t,
      });
      await queryInterface.addIndex('BillingSubscriptions', ['externalCustomerId'], {
        transaction: t,
      });

      await queryInterface.createTable(
        'BillingWebhookEvents',
        {
          eventId: {
            type: DataTypes.STRING,
            primaryKey: true,
            allowNull: false,
          },
          receivedAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
          },
        },
        { transaction: t },
      );

      await queryInterface.createTable(
        'SignupLedger',
        {
          emailHash: {
            type: DataTypes.STRING(64),
            primaryKey: true,
            allowNull: false,
          },
          firstSeenAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
          },
        },
        { transaction: t },
      );

      // Backfill from ba_user so the signup cap keeps counting users who
      // signed up before the ledger existed. Mirrors normalizeEmail():
      // trim, lowercase, drop +alias, and for gmail drop dots in the local part.
      // Several emails can normalize to one hash, so the earliest `createdAt`
      // wins — that is the anchor the trial window is measured from.
      await queryInterface.sequelize.query(
        `INSERT INTO "SignupLedger" ("emailHash", "firstSeenAt")
         SELECT encode(sha256(convert_to(normalized, 'UTF8')), 'hex'), MIN("createdAt")
         FROM (
           SELECT "createdAt",
             CASE
               WHEN split_part(lower(btrim(email)), '@', 2) IN ('gmail.com', 'googlemail.com')
               THEN replace(regexp_replace(split_part(lower(btrim(email)), '@', 1), '\\+.*$', ''), '.', '') || '@gmail.com'
               ELSE regexp_replace(split_part(lower(btrim(email)), '@', 1), '\\+.*$', '') || '@' || split_part(lower(btrim(email)), '@', 2)
             END AS normalized
           FROM ba_user
           WHERE email IS NOT NULL
         ) AS src
         GROUP BY normalized
         ON CONFLICT ("emailHash") DO NOTHING`,
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
      await queryInterface.dropTable('SignupLedger', { transaction: t });
      await queryInterface.dropTable('BillingWebhookEvents', {
        transaction: t,
      });
      await queryInterface.dropTable('BillingSubscriptions', {
        transaction: t,
      });
      await queryInterface.removeColumn('Users', 'trialEndsAt', {
        transaction: t,
      });
      await queryInterface.removeColumn('Users', 'plan', { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
