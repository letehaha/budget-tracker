import { DataTypes, AbstractQueryInterface, Transaction } from '@sequelize/core';

export default {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      // 1. Create PaymentReminders table
      await queryInterface.createTable(
        'PaymentReminders',
        {
          id: {
            type: DataTypes.UUID,
            primaryKey: true,
            allowNull: false,
          },
          userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { table: 'Users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          subscriptionId: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { table: 'Subscriptions', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          name: {
            type: DataTypes.STRING(200),
            allowNull: false,
          },
          expectedAmount: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Expected amount in cents',
          },
          currencyCode: {
            type: DataTypes.STRING(3),
            allowNull: true,
          },
          frequency: {
            type: DataTypes.ENUM('weekly', 'biweekly', 'monthly', 'quarterly', 'semi_annual', 'annual'),
            allowNull: true,
            comment: 'Null means one-off reminder',
          },
          anchorDay: {
            type: DataTypes.SMALLINT,
            allowNull: false,
            comment: 'Original day of month from first dueDate (1-31), used for month-end clamping',
          },
          dueDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
          },
          remindBefore: {
            type: DataTypes.JSONB,
            allowNull: false,
            defaultValue: [],
          },
          notifyEmail: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          preferredTime: {
            type: DataTypes.SMALLINT,
            allowNull: false,
            defaultValue: 8,
            comment: 'Hour slot (0,4,8,12,16,20) in user timezone',
          },
          timezone: {
            type: DataTypes.STRING(50),
            allowNull: false,
            defaultValue: 'UTC',
          },
          categoryId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { table: 'Categories', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          notes: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
          isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
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

      // 2. Create PaymentReminderPeriods table
      await queryInterface.createTable(
        'PaymentReminderPeriods',
        {
          id: {
            type: DataTypes.UUID,
            primaryKey: true,
            allowNull: false,
          },
          reminderId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { table: 'PaymentReminders', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          dueDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
          },
          status: {
            type: DataTypes.ENUM('upcoming', 'overdue', 'paid', 'skipped'),
            allowNull: false,
            defaultValue: 'upcoming',
          },
          paidAt: {
            type: DataTypes.DATE,
            allowNull: true,
          },
          transactionId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { table: 'Transactions', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          notes: {
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

      // 3. Create PaymentReminderNotifications table
      await queryInterface.createTable(
        'PaymentReminderNotifications',
        {
          id: {
            type: DataTypes.UUID,
            primaryKey: true,
            allowNull: false,
          },
          periodId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { table: 'PaymentReminderPeriods', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          remindBeforePreset: {
            type: DataTypes.STRING(20),
            allowNull: false,
          },
          sentAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
          },
          emailSent: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          emailError: {
            type: DataTypes.TEXT,
            allowNull: true,
          },
        },
        { transaction: t },
      );

      // 4. CHECK constraints
      // If amount is provided, currency must be provided (and vice versa)
      await queryInterface.sequelize.query(
        `ALTER TABLE "PaymentReminders" ADD CONSTRAINT "chk_payment_reminders_amount_currency"
         CHECK (
           ("expectedAmount" IS NULL AND "currencyCode" IS NULL) OR
           ("expectedAmount" IS NOT NULL AND "currencyCode" IS NOT NULL)
         );`,
        { transaction: t },
      );

      // anchorDay must be 1-31
      await queryInterface.sequelize.query(
        `ALTER TABLE "PaymentReminders" ADD CONSTRAINT "chk_payment_reminders_anchor_day"
         CHECK ("anchorDay" >= 1 AND "anchorDay" <= 31);`,
        { transaction: t },
      );

      // preferredTime must be one of the allowed slots
      await queryInterface.sequelize.query(
        `ALTER TABLE "PaymentReminders" ADD CONSTRAINT "chk_payment_reminders_preferred_time"
         CHECK ("preferredTime" IN (0, 4, 8, 12, 16, 20));`,
        { transaction: t },
      );

      // Unique constraint: prevent duplicate notifications for same period+preset
      await queryInterface.addConstraint('PaymentReminderNotifications', {
        fields: ['periodId', 'remindBeforePreset'],
        type: 'UNIQUE',
        name: 'uq_payment_reminder_notifications_period_preset',
        transaction: t,
      });

      // 5. Indexes
      await queryInterface.addIndex('PaymentReminders', ['userId', 'isActive'], {
        name: 'payment_reminders_user_id_is_active_idx',
        transaction: t,
      });

      await queryInterface.addIndex('PaymentReminders', ['subscriptionId'], {
        name: 'payment_reminders_subscription_id_idx',
        transaction: t,
      });

      await queryInterface.addIndex('PaymentReminderPeriods', ['reminderId', 'dueDate'], {
        name: 'payment_reminder_periods_reminder_id_due_date_idx',
        transaction: t,
      });

      await queryInterface.addIndex('PaymentReminderPeriods', ['reminderId', 'status'], {
        name: 'payment_reminder_periods_reminder_id_status_idx',
        transaction: t,
      });

      await queryInterface.addIndex('PaymentReminderNotifications', ['periodId'], {
        name: 'payment_reminder_notifications_period_id_idx',
        transaction: t,
      });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      await queryInterface.dropTable('PaymentReminderNotifications', { transaction: t });
      await queryInterface.dropTable('PaymentReminderPeriods', { transaction: t });
      await queryInterface.dropTable('PaymentReminders', { transaction: t });

      // Drop ENUM types
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_PaymentReminderPeriods_status";', {
        transaction: t,
      });
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_PaymentReminders_frequency";', {
        transaction: t,
      });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
