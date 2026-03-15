import { AbstractQueryInterface, DataTypes, QueryTypes, Transaction } from '@sequelize/core';

module.exports = {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const transaction: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      // ============================================================================
      // STEP 1: Create backup tables with timestamp for safe rollback
      // ============================================================================
      // Drop existing backup tables if they exist, then create fresh backups
      await queryInterface.sequelize.query('DROP TABLE IF EXISTS "Currencies_backup_20250918"', { transaction });
      await queryInterface.sequelize.query('CREATE TABLE "Currencies_backup_20250918" AS SELECT * FROM "Currencies"', {
        transaction,
      });

      await queryInterface.sequelize.query('DROP TABLE IF EXISTS "ExchangeRates_backup_20250918"', { transaction });
      await queryInterface.sequelize.query(
        'CREATE TABLE "ExchangeRates_backup_20250918" AS SELECT * FROM "ExchangeRates"',
        { transaction },
      );

      // Check if UserExchangeRates exists and backup if needed
      const tableNames = await queryInterface.showAllTables();
      if (tableNames.includes('UserExchangeRates')) {
        await queryInterface.sequelize.query('DROP TABLE IF EXISTS "UserExchangeRates_backup_20250918"', {
          transaction,
        });
        await queryInterface.sequelize.query(
          'CREATE TABLE "UserExchangeRates_backup_20250918" AS SELECT * FROM "UserExchangeRates"',
          { transaction },
        );
      }

      // ============================================================================
      // STEP 2: Create new Currencies table with code as primary key
      // ============================================================================
      await queryInterface.createTable(
        'CurrenciesNew',
        {
          code: {
            type: DataTypes.STRING(3),
            primaryKey: true,
            allowNull: false,
          },
          currency: {
            type: DataTypes.STRING,
            allowNull: false,
          },
          digits: {
            type: DataTypes.INTEGER,
            allowNull: false,
          },
          number: {
            type: DataTypes.INTEGER,
            allowNull: false,
          },
          isDisabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
        },
        { transaction },
      );

      // Copy data from old Currencies table
      await queryInterface.sequelize.query(
        `
        INSERT INTO "CurrenciesNew" (code, currency, digits, number, "isDisabled")
        SELECT code, currency, digits, number, "isDisabled"
        FROM "Currencies"
        `,
        { transaction },
      );

      // ============================================================================
      // STEP 3: Create new ExchangeRates table with composite primary key
      // ============================================================================
      await queryInterface.createTable(
        'ExchangeRatesNew',
        {
          baseCode: {
            type: DataTypes.STRING(3),
            allowNull: false,
            references: {
              table: 'CurrenciesNew',
              key: 'code',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          quoteCode: {
            type: DataTypes.STRING(3),
            allowNull: false,
            references: {
              table: 'CurrenciesNew',
              key: 'code',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          rate: {
            type: DataTypes.FLOAT,
            allowNull: false,
            defaultValue: 1,
          },
          date: {
            type: DataTypes.DATE,
            allowNull: false,
          },
        },
        { transaction },
      );

      // Add composite primary key constraint
      await queryInterface.addConstraint('ExchangeRatesNew', {
        fields: ['baseCode', 'quoteCode', 'date'],
        type: 'primary key',
        name: 'ExchangeRatesNew_pkey',
        transaction,
      });

      // Copy data from old ExchangeRates table with deduplication
      // Use ROW_NUMBER() to handle duplicates - keep the latest rate for each combination
      await queryInterface.sequelize.query(
        `
        INSERT INTO "ExchangeRatesNew" ("baseCode", "quoteCode", rate, date)
        SELECT "baseCode", "quoteCode", rate, date
        FROM (
          SELECT "baseCode", "quoteCode", rate, date,
                 ROW_NUMBER() OVER (PARTITION BY "baseCode", "quoteCode", date ORDER BY id DESC) as rn
          FROM "ExchangeRates"
        ) ranked
        WHERE rn = 1
        `,
        { transaction },
      );

      // ============================================================================
      // STEP 4: Remove all foreign key constraints that reference old Currencies.id
      // ============================================================================

      // Helper function to get actual constraint names
      const getConstraintNames = async (tableName: string, columnName: string): Promise<string[]> => {
        const result = (await queryInterface.sequelize.query(
          `
          SELECT tc.constraint_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
          WHERE tc.table_name = '${tableName}'
            AND tc.constraint_type = 'FOREIGN KEY'
            AND kcu.column_name = '${columnName}'
        `,
          { type: QueryTypes.SELECT, transaction },
        )) as { constraint_name: string }[];
        return result.map((row) => row.constraint_name);
      };

      // Remove UsersCurrencies constraints
      const usersCurrenciesConstraints = await getConstraintNames('UsersCurrencies', 'currencyId');
      for (const constraintName of usersCurrenciesConstraints) {
        await queryInterface.removeConstraint('UsersCurrencies', constraintName, { transaction });
      }

      // Remove ExchangeRates constraints
      const exchangeRatesBaseConstraints = await getConstraintNames('ExchangeRates', 'baseId');
      for (const constraintName of exchangeRatesBaseConstraints) {
        await queryInterface.removeConstraint('ExchangeRates', constraintName, { transaction });
      }

      const exchangeRatesQuoteConstraints = await getConstraintNames('ExchangeRates', 'quoteId');
      for (const constraintName of exchangeRatesQuoteConstraints) {
        await queryInterface.removeConstraint('ExchangeRates', constraintName, { transaction });
      }

      // Check and remove Accounts constraints if they exist
      const accountsTableInfo = await queryInterface.describeTable('Accounts');
      if (accountsTableInfo.currencyId) {
        const accountsConstraints = await getConstraintNames('Accounts', 'currencyId');
        for (const constraintName of accountsConstraints) {
          await queryInterface.removeConstraint('Accounts', constraintName, { transaction });
        }
      }

      // Remove Transactions constraints if they exist
      const transactionsTableInfo = await queryInterface.describeTable('Transactions');
      if (transactionsTableInfo.currencyId) {
        const transactionsConstraints = await getConstraintNames('Transactions', 'currencyId');
        for (const constraintName of transactionsConstraints) {
          await queryInterface.removeConstraint('Transactions', constraintName, { transaction });
        }
      }

      // Remove PortfolioBalances constraints if they exist
      const portfolioBalancesTableInfo = await queryInterface.describeTable('PortfolioBalances');
      if (portfolioBalancesTableInfo.currencyId) {
        const portfolioBalancesConstraints = await getConstraintNames('PortfolioBalances', 'currencyId');
        for (const constraintName of portfolioBalancesConstraints) {
          await queryInterface.removeConstraint('PortfolioBalances', constraintName, { transaction });
        }
      }

      // Remove PortfolioTransfers constraints if they exist
      const portfolioTransfersTableInfo = await queryInterface.describeTable('PortfolioTransfers');
      if (portfolioTransfersTableInfo.currencyId) {
        const portfolioTransfersConstraints = await getConstraintNames('PortfolioTransfers', 'currencyId');
        for (const constraintName of portfolioTransfersConstraints) {
          await queryInterface.removeConstraint('PortfolioTransfers', constraintName, { transaction });
        }
      }

      // Remove UserExchangeRates constraints if they exist
      const userExchangeRatesTableInfo = await queryInterface.describeTable('UserExchangeRates');
      if (userExchangeRatesTableInfo.baseId) {
        const userExchangeRatesBaseConstraints = await getConstraintNames('UserExchangeRates', 'baseId');
        for (const constraintName of userExchangeRatesBaseConstraints) {
          await queryInterface.removeConstraint('UserExchangeRates', constraintName, { transaction });
        }
      }
      if (userExchangeRatesTableInfo.quoteId) {
        const userExchangeRatesQuoteConstraints = await getConstraintNames('UserExchangeRates', 'quoteId');
        for (const constraintName of userExchangeRatesQuoteConstraints) {
          await queryInterface.removeConstraint('UserExchangeRates', constraintName, { transaction });
        }
      }
      if (userExchangeRatesTableInfo.userId) {
        const userExchangeRatesUserConstraints = await getConstraintNames('UserExchangeRates', 'userId');
        for (const constraintName of userExchangeRatesUserConstraints) {
          await queryInterface.removeConstraint('UserExchangeRates', constraintName, { transaction });
        }
      }

      // ============================================================================
      // STEP 5: Update UsersCurrencies table to use currencyCode
      // ============================================================================

      // Add currencyCode column
      await queryInterface.addColumn(
        'UsersCurrencies',
        'currencyCode',
        {
          type: DataTypes.STRING(3),
          allowNull: true, // Initially nullable for migration
        },
        { transaction },
      );

      // Populate currencyCode from old Currencies table
      await queryInterface.sequelize.query(
        `
        UPDATE "UsersCurrencies"
        SET "currencyCode" = (
          SELECT code
          FROM "Currencies"
          WHERE "Currencies".id = "UsersCurrencies"."currencyId"
        )
        `,
        { transaction },
      );

      // Make currencyCode not nullable and add FK constraint
      await queryInterface.changeColumn(
        'UsersCurrencies',
        'currencyCode',
        {
          type: DataTypes.STRING(3),
          allowNull: false,
        },
        { transaction },
      );

      await queryInterface.addConstraint('UsersCurrencies', {
        fields: ['currencyCode'],
        type: 'foreign key',
        name: 'UsersCurrencies_currencyCode_fkey',
        references: {
          table: 'CurrenciesNew',
          field: 'code',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });

      // Remove currencyId column after migration to currencyCode
      await queryInterface.removeColumn('UsersCurrencies', 'currencyId', { transaction });

      // ============================================================================
      // STEP 6: Clean up invalid data before schema changes
      // ============================================================================

      // Remove transactions with NULL currencyId or NULL userId (invalid data)
      const invalidTransactionsCountResult = (await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM "Transactions" WHERE "currencyId" IS NULL OR "userId" IS NULL',
        { type: QueryTypes.SELECT, transaction },
      )) as { count: string }[];

      const invalidTransactionsCount = parseInt(invalidTransactionsCountResult[0]?.count || '0');

      if (invalidTransactionsCount > 0) {
        await queryInterface.sequelize.query(
          'DELETE FROM "Transactions" WHERE "currencyId" IS NULL OR "userId" IS NULL',
          { transaction },
        );
      }

      // ============================================================================
      // STEP 7: Update tables to use currencyCode instead of currencyId
      // ============================================================================

      // Update Accounts table
      if (accountsTableInfo.currencyId) {
        await queryInterface.addColumn(
          'Accounts',
          'currencyCode',
          {
            type: DataTypes.STRING(3),
            allowNull: true,
          },
          { transaction },
        );

        await queryInterface.sequelize.query(
          `UPDATE "Accounts" SET "currencyCode" = (
            SELECT code FROM "Currencies" WHERE "Currencies".id = "Accounts"."currencyId"
          )`,
          { transaction },
        );

        await queryInterface.changeColumn(
          'Accounts',
          'currencyCode',
          {
            type: DataTypes.STRING(3),
            allowNull: false,
          },
          { transaction },
        );

        await queryInterface.addConstraint('Accounts', {
          fields: ['currencyCode'],
          type: 'foreign key',
          name: 'Accounts_currencyCode_fkey',
          references: { table: 'CurrenciesNew', field: 'code' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
          transaction,
        });

        // Remove currencyId column after migration to currencyCode
        await queryInterface.removeColumn('Accounts', 'currencyId', { transaction });
      }

      // Update Transactions table (currencyCode already exists)
      if (transactionsTableInfo.currencyId && transactionsTableInfo.currencyCode) {
        await queryInterface.sequelize.query(
          `UPDATE "Transactions" SET "currencyCode" = (
            SELECT code FROM "Currencies" WHERE "Currencies".id = "Transactions"."currencyId"
          )`,
          { transaction },
        );

        await queryInterface.changeColumn(
          'Transactions',
          'currencyCode',
          {
            type: DataTypes.STRING(3),
            allowNull: false,
          },
          { transaction },
        );

        // Check if constraint already exists before adding
        const existingTransactionsConstraints = (await queryInterface.sequelize.query(
          `SELECT constraint_name FROM information_schema.table_constraints
           WHERE table_name = 'Transactions' AND constraint_name = 'Transactions_currencyCode_fkey'`,
          { type: QueryTypes.SELECT, transaction },
        )) as { constraint_name: string }[];

        if (existingTransactionsConstraints.length === 0) {
          await queryInterface.addConstraint('Transactions', {
            fields: ['currencyCode'],
            type: 'foreign key',
            name: 'Transactions_currencyCode_fkey',
            references: { table: 'CurrenciesNew', field: 'code' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
            transaction,
          });
        }

        // Update refCurrencyCode to be a foreign key as well
        if (transactionsTableInfo.refCurrencyCode) {
          await queryInterface.changeColumn(
            'Transactions',
            'refCurrencyCode',
            {
              type: DataTypes.STRING(3),
              allowNull: true,
            },
            { transaction },
          );

          // Check if constraint already exists before adding
          const existingRefCurrencyConstraints = (await queryInterface.sequelize.query(
            `SELECT constraint_name FROM information_schema.table_constraints
             WHERE table_name = 'Transactions' AND constraint_name = 'Transactions_refCurrencyCode_fkey'`,
            { type: QueryTypes.SELECT, transaction },
          )) as { constraint_name: string }[];

          if (existingRefCurrencyConstraints.length === 0) {
            await queryInterface.addConstraint('Transactions', {
              fields: ['refCurrencyCode'],
              type: 'foreign key',
              name: 'Transactions_refCurrencyCode_fkey',
              references: { table: 'CurrenciesNew', field: 'code' },
              onDelete: 'SET NULL',
              onUpdate: 'CASCADE',
              transaction,
            });
          }
        }

        // Remove currencyId column after migration to currencyCode
        await queryInterface.removeColumn('Transactions', 'currencyId', { transaction });
      }

      // Update PortfolioBalances table
      if (portfolioBalancesTableInfo.currencyId && !portfolioBalancesTableInfo.currencyCode) {
        await queryInterface.addColumn(
          'PortfolioBalances',
          'currencyCode',
          {
            type: DataTypes.STRING(3),
            allowNull: true,
          },
          { transaction },
        );

        await queryInterface.sequelize.query(
          `UPDATE "PortfolioBalances" SET "currencyCode" = (
            SELECT code FROM "Currencies" WHERE "Currencies".id = "PortfolioBalances"."currencyId"
          )`,
          { transaction },
        );

        await queryInterface.changeColumn(
          'PortfolioBalances',
          'currencyCode',
          {
            type: DataTypes.STRING(3),
            allowNull: false,
          },
          { transaction },
        );

        await queryInterface.addConstraint('PortfolioBalances', {
          fields: ['currencyCode'],
          type: 'foreign key',
          name: 'PortfolioBalances_currencyCode_fkey',
          references: { table: 'CurrenciesNew', field: 'code' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
          transaction,
        });

        // Remove currencyId column after migration to currencyCode
        await queryInterface.removeColumn('PortfolioBalances', 'currencyId', { transaction });
      }

      // Update PortfolioTransfers table
      if (portfolioTransfersTableInfo.currencyId && !portfolioTransfersTableInfo.currencyCode) {
        await queryInterface.addColumn(
          'PortfolioTransfers',
          'currencyCode',
          {
            type: DataTypes.STRING(3),
            allowNull: true,
          },
          { transaction },
        );

        await queryInterface.sequelize.query(
          `UPDATE "PortfolioTransfers" SET "currencyCode" = (
            SELECT code FROM "Currencies" WHERE "Currencies".id = "PortfolioTransfers"."currencyId"
          )`,
          { transaction },
        );

        await queryInterface.changeColumn(
          'PortfolioTransfers',
          'currencyCode',
          {
            type: DataTypes.STRING(3),
            allowNull: false,
          },
          { transaction },
        );

        await queryInterface.addConstraint('PortfolioTransfers', {
          fields: ['currencyCode'],
          type: 'foreign key',
          name: 'PortfolioTransfers_currencyCode_fkey',
          references: { table: 'CurrenciesNew', field: 'code' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
          transaction,
        });

        // Remove currencyId column after migration to currencyCode
        await queryInterface.removeColumn('PortfolioTransfers', 'currencyId', { transaction });
      }

      // ============================================================================
      // STEP 8: Create new UserExchangeRates table structure
      // ============================================================================

      await queryInterface.createTable(
        'UserExchangeRatesNew',
        {
          userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
              table: 'Users',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          baseCode: {
            type: DataTypes.STRING(3),
            allowNull: false,
            references: {
              table: 'CurrenciesNew',
              key: 'code',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          quoteCode: {
            type: DataTypes.STRING(3),
            allowNull: false,
            references: {
              table: 'CurrenciesNew',
              key: 'code',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          rate: {
            type: DataTypes.FLOAT,
            allowNull: false,
            defaultValue: 1,
          },
          date: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
          },
        },
        { transaction },
      );

      // Add composite primary key
      await queryInterface.addConstraint('UserExchangeRatesNew', {
        fields: ['userId', 'baseCode', 'quoteCode', 'date'],
        type: 'primary key',
        name: 'UserExchangeRatesNew_pkey',
        transaction,
      });

      // Migrate data from old UserExchangeRates if it exists and has ID-based structure
      const userExchangeRatesExists = tableNames.includes('UserExchangeRates');
      if (userExchangeRatesExists && userExchangeRatesTableInfo.baseId && userExchangeRatesTableInfo.quoteId) {
        await queryInterface.sequelize.query(
          `
          INSERT INTO "UserExchangeRatesNew" ("userId", "baseCode", "quoteCode", rate, date)
          SELECT
            uer."userId",
            cb.code as "baseCode",
            cq.code as "quoteCode",
            uer.rate,
            uer."createdAt" as date
          FROM (
            SELECT uer."userId", uer."baseId", uer."quoteId", uer.rate, uer."createdAt",
                   ROW_NUMBER() OVER (PARTITION BY uer."userId", uer."baseId", uer."quoteId", uer."createdAt" ORDER BY uer.id DESC) as rn
            FROM "UserExchangeRates" uer
          ) uer
          JOIN "Currencies" cb ON cb.id = uer."baseId"
          JOIN "Currencies" cq ON cq.id = uer."quoteId"
          WHERE uer.rn = 1
          `,
          { transaction },
        );
      }

      // ============================================================================
      // STEP 9: Validate data migration before dropping old tables
      // ============================================================================

      // Validate Currencies data migration
      const oldCurrenciesResult = (await queryInterface.sequelize.query('SELECT COUNT(*) as count FROM "Currencies"', {
        type: QueryTypes.SELECT,
        transaction,
      })) as { count: string }[];
      const newCurrenciesResult = (await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM "CurrenciesNew"',
        { type: QueryTypes.SELECT, transaction },
      )) as { count: string }[];

      if (!oldCurrenciesResult[0] || !newCurrenciesResult[0]) {
        throw new Error('Failed to get currency counts for validation');
      }

      const oldCurrenciesCount = parseInt(oldCurrenciesResult[0].count);
      const newCurrenciesCount = parseInt(newCurrenciesResult[0].count);

      if (oldCurrenciesCount !== newCurrenciesCount) {
        throw new Error(`Currencies migration validation failed: old=${oldCurrenciesCount}, new=${newCurrenciesCount}`);
      }

      // Validate ExchangeRates data migration (may be fewer due to deduplication)
      const oldExchangeRatesResult = (await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM "ExchangeRates"',
        { type: QueryTypes.SELECT, transaction },
      )) as { count: string }[];
      const newExchangeRatesResult = (await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM "ExchangeRatesNew"',
        { type: QueryTypes.SELECT, transaction },
      )) as { count: string }[];
      const uniqueExchangeRatesResult = (await queryInterface.sequelize.query(
        'SELECT COUNT(DISTINCT("baseCode", "quoteCode", date)) as count FROM "ExchangeRates"',
        { type: QueryTypes.SELECT, transaction },
      )) as { count: string }[];

      if (!oldExchangeRatesResult[0] || !newExchangeRatesResult[0] || !uniqueExchangeRatesResult[0]) {
        throw new Error('Failed to get exchange rates counts for validation');
      }

      const oldExchangeRatesCount = parseInt(oldExchangeRatesResult[0].count);
      const newExchangeRatesCount = parseInt(newExchangeRatesResult[0].count);
      const uniqueExchangeRatesCount = parseInt(uniqueExchangeRatesResult[0].count);

      // Validate that new count matches unique combinations (deduplication worked correctly)
      if (newExchangeRatesCount !== uniqueExchangeRatesCount) {
        throw new Error(
          `ExchangeRates deduplication validation failed: new=${newExchangeRatesCount}, unique=${uniqueExchangeRatesCount}`,
        );
      }

      // Log if duplicates were removed
      if (oldExchangeRatesCount !== newExchangeRatesCount) {
        console.log(
          `ExchangeRates duplicates removed: ${oldExchangeRatesCount - newExchangeRatesCount} duplicate entries`,
        );
      }

      // Validate UserExchangeRates data migration if it exists and was migrated
      if (
        userExchangeRatesExists &&
        userExchangeRatesTableInfo.id &&
        userExchangeRatesTableInfo.baseId &&
        userExchangeRatesTableInfo.quoteId
      ) {
        const oldUserExchangeRatesResult = (await queryInterface.sequelize.query(
          'SELECT COUNT(*) as count FROM "UserExchangeRates"',
          { type: QueryTypes.SELECT, transaction },
        )) as { count: string }[];
        const newUserExchangeRatesResult = (await queryInterface.sequelize.query(
          'SELECT COUNT(*) as count FROM "UserExchangeRatesNew"',
          { type: QueryTypes.SELECT, transaction },
        )) as { count: string }[];

        if (!oldUserExchangeRatesResult[0] || !newUserExchangeRatesResult[0]) {
          throw new Error('Failed to get user exchange rates counts for validation');
        }

        const oldUserExchangeRatesCount = parseInt(oldUserExchangeRatesResult[0].count);
        const newUserExchangeRatesCount = parseInt(newUserExchangeRatesResult[0].count);

        if (oldUserExchangeRatesCount !== newUserExchangeRatesCount) {
          throw new Error(
            `UserExchangeRates migration validation failed: old=${oldUserExchangeRatesCount}, new=${newUserExchangeRatesCount}`,
          );
        }
      }

      // Validate that all currencyCode values are populated
      const nullCurrencyCodeResult = (await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM "UsersCurrencies" WHERE "currencyCode" IS NULL',
        { type: QueryTypes.SELECT, transaction },
      )) as { count: string }[];

      if (!nullCurrencyCodeResult[0]) {
        throw new Error('Failed to get null currency code count for validation');
      }

      const nullCurrencyCodeCount = parseInt(nullCurrencyCodeResult[0].count);

      if (nullCurrencyCodeCount > 0) {
        throw new Error(`Found ${nullCurrencyCodeCount} NULL currencyCode values in UsersCurrencies`);
      }

      // ============================================================================
      // STEP 10: Drop old tables and rename new ones
      // ============================================================================

      // Drop old tables
      if (userExchangeRatesExists && userExchangeRatesTableInfo.id) {
        await queryInterface.dropTable('UserExchangeRates', { transaction });
      }
      await queryInterface.dropTable('ExchangeRates', { transaction });
      await queryInterface.dropTable('Currencies', { transaction });

      // Rename new tables
      await queryInterface.renameTable('CurrenciesNew', 'Currencies', { transaction });
      await queryInterface.renameTable('ExchangeRatesNew', 'ExchangeRates', { transaction });
      if (userExchangeRatesExists && userExchangeRatesTableInfo.id) {
        await queryInterface.renameTable('UserExchangeRatesNew', 'UserExchangeRates', { transaction });
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  down: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const transaction: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      console.log('🔄 Starting migration rollback...');

      // ============================================================================
      // STEP 1: Verify backup tables exist
      // ============================================================================
      console.log('📋 Step 1: Checking backup tables...');
      const tableNames = await queryInterface.showAllTables();
      const backupTablesExist = ['Currencies_backup_20250918', 'ExchangeRates_backup_20250918'].every((table) =>
        tableNames.includes(table),
      );

      if (!backupTablesExist) {
        throw new Error('Backup tables from 2025-09-18 not found. Cannot safely rollback this migration.');
      }
      console.log('✅ Backup tables found');

      // ============================================================================
      // STEP 2: Remove current foreign key constraints
      // ============================================================================
      console.log('🔗 Step 2: Removing foreign key constraints...');

      // Remove UsersCurrencies constraints
      console.log('  - Removing UsersCurrencies_currencyCode_fkey...');
      await queryInterface.removeConstraint('UsersCurrencies', 'UsersCurrencies_currencyCode_fkey', { transaction });
      console.log('  ✅ UsersCurrencies constraint removed');

      // Remove foreign key constraints from all tables that use currencyCode
      console.log('  - Checking Accounts table...');
      const accountsHasCurrencyCode = (await queryInterface.sequelize.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'Accounts' AND column_name = 'currencyCode'`,
        { type: QueryTypes.SELECT, transaction },
      )) as { column_name: string }[];

      if (accountsHasCurrencyCode.length > 0) {
        // Check if constraint exists before removing
        const accountsConstraintExists = (await queryInterface.sequelize.query(
          `SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'Accounts' AND constraint_name = 'Accounts_currencyCode_fkey'`,
          { type: QueryTypes.SELECT, transaction },
        )) as { constraint_name: string }[];

        if (accountsConstraintExists.length > 0) {
          console.log('  - Removing Accounts_currencyCode_fkey...');
          await queryInterface.removeConstraint('Accounts', 'Accounts_currencyCode_fkey', { transaction });
          console.log('  ✅ Accounts constraint removed');
        }
      }

      console.log('  - Checking Transactions table...');
      const transactionsHasCurrencyCode = (await queryInterface.sequelize.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'Transactions' AND column_name = 'currencyCode'`,
        { type: QueryTypes.SELECT, transaction },
      )) as { column_name: string }[];
      const transactionsHasRefCurrencyCode = (await queryInterface.sequelize.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'Transactions' AND column_name = 'refCurrencyCode'`,
        { type: QueryTypes.SELECT, transaction },
      )) as { column_name: string }[];

      if (transactionsHasCurrencyCode.length > 0) {
        // Check if constraint exists before removing
        const currencyCodeConstraintExists = (await queryInterface.sequelize.query(
          `SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'Transactions' AND constraint_name = 'Transactions_currencyCode_fkey'`,
          { type: QueryTypes.SELECT, transaction },
        )) as { constraint_name: string }[];

        if (currencyCodeConstraintExists.length > 0) {
          console.log('  - Removing Transactions_currencyCode_fkey...');
          await queryInterface.removeConstraint('Transactions', 'Transactions_currencyCode_fkey', { transaction });
          console.log('  ✅ Transactions currencyCode constraint removed');
        }
      }
      if (transactionsHasRefCurrencyCode.length > 0) {
        // Check if constraint exists before removing
        const refCurrencyCodeConstraintExists = (await queryInterface.sequelize.query(
          `SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'Transactions' AND constraint_name = 'Transactions_refCurrencyCode_fkey'`,
          { type: QueryTypes.SELECT, transaction },
        )) as { constraint_name: string }[];

        if (refCurrencyCodeConstraintExists.length > 0) {
          console.log('  - Removing Transactions_refCurrencyCode_fkey...');
          await queryInterface.removeConstraint('Transactions', 'Transactions_refCurrencyCode_fkey', { transaction });
          console.log('  ✅ Transactions refCurrencyCode constraint removed');
        }
      }

      console.log('  - Checking PortfolioBalances table...');
      const portfolioBalancesHasCurrencyCode = (await queryInterface.sequelize.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'PortfolioBalances' AND column_name = 'currencyCode'`,
        { type: QueryTypes.SELECT, transaction },
      )) as { column_name: string }[];

      if (portfolioBalancesHasCurrencyCode.length > 0) {
        // Check if constraint exists before removing
        const portfolioBalancesConstraintExists = (await queryInterface.sequelize.query(
          `SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'PortfolioBalances' AND constraint_name = 'PortfolioBalances_currencyCode_fkey'`,
          { type: QueryTypes.SELECT, transaction },
        )) as { constraint_name: string }[];

        if (portfolioBalancesConstraintExists.length > 0) {
          console.log('  - Removing PortfolioBalances_currencyCode_fkey...');
          await queryInterface.removeConstraint('PortfolioBalances', 'PortfolioBalances_currencyCode_fkey', {
            transaction,
          });
          console.log('  ✅ PortfolioBalances constraint removed');
        }
      }

      console.log('  - Checking PortfolioTransfers table...');
      const portfolioTransfersHasCurrencyCode = (await queryInterface.sequelize.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'PortfolioTransfers' AND column_name = 'currencyCode'`,
        { type: QueryTypes.SELECT, transaction },
      )) as { column_name: string }[];

      if (portfolioTransfersHasCurrencyCode.length > 0) {
        // Check if constraint exists before removing
        const portfolioTransfersConstraintExists = (await queryInterface.sequelize.query(
          `SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'PortfolioTransfers' AND constraint_name = 'PortfolioTransfers_currencyCode_fkey'`,
          { type: QueryTypes.SELECT, transaction },
        )) as { constraint_name: string }[];

        if (portfolioTransfersConstraintExists.length > 0) {
          console.log('  - Removing PortfolioTransfers_currencyCode_fkey...');
          await queryInterface.removeConstraint('PortfolioTransfers', 'PortfolioTransfers_currencyCode_fkey', {
            transaction,
          });
          console.log('  ✅ PortfolioTransfers constraint removed');
        }
      }

      console.log('✅ All foreign key constraints removed');

      // ============================================================================
      // STEP 3: Drop current tables
      // ============================================================================
      console.log('🗑️  Step 3: Dropping current tables...');
      if (tableNames.includes('UserExchangeRates')) {
        console.log('  - Dropping UserExchangeRates...');
        await queryInterface.dropTable('UserExchangeRates', { transaction });
        console.log('  ✅ UserExchangeRates dropped');
      }
      console.log('  - Dropping ExchangeRates...');
      await queryInterface.dropTable('ExchangeRates', { transaction });
      console.log('  ✅ ExchangeRates dropped');

      console.log('  - Dropping Currencies...');
      await queryInterface.dropTable('Currencies', { transaction });
      console.log('  ✅ Currencies dropped');

      // ============================================================================
      // STEP 4: Restore from backup tables
      // ============================================================================
      console.log('🔄 Step 4: Restoring from backup tables...');

      // Restore Currencies table
      console.log('  - Restoring Currencies table...');
      await queryInterface.sequelize.query('CREATE TABLE "Currencies" AS SELECT * FROM "Currencies_backup_20250918"', {
        transaction,
      });
      console.log('  ✅ Currencies table restored');

      // Restore ExchangeRates table
      console.log('  - Restoring ExchangeRates table (this may take a while due to data size)...');
      await queryInterface.sequelize.query(
        'CREATE TABLE "ExchangeRates" AS SELECT * FROM "ExchangeRates_backup_20250918"',
        { transaction },
      );
      console.log('  ✅ ExchangeRates table restored');

      // Restore UserExchangeRates table if backup exists
      if (tableNames.includes('UserExchangeRates_backup_20250918')) {
        console.log('  - Restoring UserExchangeRates table...');
        await queryInterface.sequelize.query(
          'CREATE TABLE "UserExchangeRates" AS SELECT * FROM "UserExchangeRates_backup_20250918"',
          { transaction },
        );
        console.log('  ✅ UserExchangeRates table restored');
      }

      // ============================================================================
      // STEP 5: Restore currencyId column to Transactions table
      // ============================================================================
      console.log('🔧 Step 5: Restoring currencyId column to Transactions...');

      // Check if Transactions table has currencyCode column (means migration was applied)
      const transactionsHasCurrencyCodeCheck = (await queryInterface.sequelize.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'Transactions' AND column_name = 'currencyCode'`,
        { type: QueryTypes.SELECT, transaction },
      )) as { column_name: string }[];

      if (transactionsHasCurrencyCodeCheck.length > 0) {
        console.log('  - Adding currencyId column back to Transactions...');

        // Add currencyId column back
        await queryInterface.addColumn(
          'Transactions',
          'currencyId',
          {
            type: DataTypes.INTEGER,
            allowNull: true, // Initially nullable for data migration
          },
          { transaction },
        );

        // Populate currencyId from currencyCode using backup Currencies table
        await queryInterface.sequelize.query(
          `UPDATE "Transactions" SET "currencyId" = (
            SELECT id FROM "Currencies_backup_20250918"
            WHERE "Currencies_backup_20250918".code = "Transactions"."currencyCode"
          )`,
          { transaction },
        );

        // Make currencyId not nullable
        await queryInterface.changeColumn(
          'Transactions',
          'currencyId',
          {
            type: DataTypes.INTEGER,
            allowNull: false,
          },
          { transaction },
        );

        console.log('  ✅ Transactions currencyId column restored');
      } else {
        console.log('  - Transactions table does not have currencyCode, skipping currencyId restoration');
      }

      // Restore currencyId columns to other tables
      const accountsHasCurrencyCodeCheck = (await queryInterface.sequelize.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'Accounts' AND column_name = 'currencyCode'`,
        { type: QueryTypes.SELECT, transaction },
      )) as { column_name: string }[];

      if (accountsHasCurrencyCodeCheck.length > 0) {
        console.log('  - Restoring currencyId column to Accounts...');
        await queryInterface.addColumn(
          'Accounts',
          'currencyId',
          {
            type: DataTypes.INTEGER,
            allowNull: true,
          },
          { transaction },
        );

        await queryInterface.sequelize.query(
          `UPDATE "Accounts" SET "currencyId" = (
            SELECT id FROM "Currencies_backup_20250918"
            WHERE "Currencies_backup_20250918".code = "Accounts"."currencyCode"
          )`,
          { transaction },
        );

        await queryInterface.changeColumn(
          'Accounts',
          'currencyId',
          {
            type: DataTypes.INTEGER,
            allowNull: false,
          },
          { transaction },
        );
        console.log('  ✅ Accounts currencyId column restored');
      }

      const portfolioBalancesHasCurrencyCodeCheck = (await queryInterface.sequelize.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'PortfolioBalances' AND column_name = 'currencyCode'`,
        { type: QueryTypes.SELECT, transaction },
      )) as { column_name: string }[];

      if (portfolioBalancesHasCurrencyCodeCheck.length > 0) {
        console.log('  - Restoring currencyId column to PortfolioBalances...');
        await queryInterface.addColumn(
          'PortfolioBalances',
          'currencyId',
          {
            type: DataTypes.INTEGER,
            allowNull: true,
          },
          { transaction },
        );

        await queryInterface.sequelize.query(
          `UPDATE "PortfolioBalances" SET "currencyId" = (
            SELECT id FROM "Currencies_backup_20250918"
            WHERE "Currencies_backup_20250918".code = "PortfolioBalances"."currencyCode"
          )`,
          { transaction },
        );

        await queryInterface.changeColumn(
          'PortfolioBalances',
          'currencyId',
          {
            type: DataTypes.INTEGER,
            allowNull: false,
          },
          { transaction },
        );
        console.log('  ✅ PortfolioBalances currencyId column restored');
      }

      const portfolioTransfersHasCurrencyCodeCheck = (await queryInterface.sequelize.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'PortfolioTransfers' AND column_name = 'currencyCode'`,
        { type: QueryTypes.SELECT, transaction },
      )) as { column_name: string }[];

      if (portfolioTransfersHasCurrencyCodeCheck.length > 0) {
        console.log('  - Restoring currencyId column to PortfolioTransfers...');
        await queryInterface.addColumn(
          'PortfolioTransfers',
          'currencyId',
          {
            type: DataTypes.INTEGER,
            allowNull: true,
          },
          { transaction },
        );

        await queryInterface.sequelize.query(
          `UPDATE "PortfolioTransfers" SET "currencyId" = (
            SELECT id FROM "Currencies_backup_20250918"
            WHERE "Currencies_backup_20250918".code = "PortfolioTransfers"."currencyCode"
          )`,
          { transaction },
        );

        await queryInterface.changeColumn(
          'PortfolioTransfers',
          'currencyId',
          {
            type: DataTypes.INTEGER,
            allowNull: false,
          },
          { transaction },
        );
        console.log('  ✅ PortfolioTransfers currencyId column restored');
      }

      const usersCurrenciesHasCurrencyCodeCheck = (await queryInterface.sequelize.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'UsersCurrencies' AND column_name = 'currencyCode'`,
        { type: QueryTypes.SELECT, transaction },
      )) as { column_name: string }[];

      if (usersCurrenciesHasCurrencyCodeCheck.length > 0) {
        console.log('  - Restoring currencyId column to UsersCurrencies...');
        await queryInterface.addColumn(
          'UsersCurrencies',
          'currencyId',
          {
            type: DataTypes.INTEGER,
            allowNull: true,
          },
          { transaction },
        );

        await queryInterface.sequelize.query(
          `UPDATE "UsersCurrencies" SET "currencyId" = (
            SELECT id FROM "Currencies_backup_20250918"
            WHERE "Currencies_backup_20250918".code = "UsersCurrencies"."currencyCode"
          )`,
          { transaction },
        );

        await queryInterface.changeColumn(
          'UsersCurrencies',
          'currencyId',
          {
            type: DataTypes.INTEGER,
            allowNull: false,
          },
          { transaction },
        );
        console.log('  ✅ UsersCurrencies currencyId column restored');
      }

      // ============================================================================
      // STEP 6: Recreate sequences, primary keys and constraints
      // ============================================================================
      console.log('🔧 Step 6: Recreating sequences, primary keys and constraints...');

      // Recreate sequences for auto-increment columns
      console.log('  - Recreating Currencies sequence...');
      await queryInterface.sequelize.query(
        `
        CREATE SEQUENCE IF NOT EXISTS "Currencies_id_seq"
        OWNED BY "Currencies".id;

        SELECT setval('"Currencies_id_seq"', COALESCE(MAX(id), 1)) FROM "Currencies";

        ALTER TABLE "Currencies"
        ALTER COLUMN id SET DEFAULT nextval('"Currencies_id_seq"');
      `,
        { transaction },
      );
      console.log('  ✅ Currencies sequence recreated');

      console.log('  - Recreating ExchangeRates sequence...');
      await queryInterface.sequelize.query(
        `
        CREATE SEQUENCE IF NOT EXISTS "ExchangeRates_id_seq"
        OWNED BY "ExchangeRates".id;

        SELECT setval('"ExchangeRates_id_seq"', COALESCE(MAX(id), 1)) FROM "ExchangeRates";

        ALTER TABLE "ExchangeRates"
        ALTER COLUMN id SET DEFAULT nextval('"ExchangeRates_id_seq"');
      `,
        { transaction },
      );
      console.log('  ✅ ExchangeRates sequence recreated');

      if (tableNames.includes('UserExchangeRates_backup_20250918')) {
        console.log('  - Recreating UserExchangeRates sequence...');
        await queryInterface.sequelize.query(
          `
          CREATE SEQUENCE IF NOT EXISTS "UserExchangeRates_id_seq"
          OWNED BY "UserExchangeRates".id;

          SELECT setval('"UserExchangeRates_id_seq"', COALESCE(MAX(id), 1)) FROM "UserExchangeRates";

          ALTER TABLE "UserExchangeRates"
          ALTER COLUMN id SET DEFAULT nextval('"UserExchangeRates_id_seq"');
        `,
          { transaction },
        );
        console.log('  ✅ UserExchangeRates sequence recreated');
      }

      // Add primary key to Currencies
      console.log('  - Adding Currencies primary key...');
      await queryInterface.addConstraint('Currencies', {
        fields: ['id'],
        type: 'primary key',
        name: 'Currencies_pkey',
        transaction,
      });
      console.log('  ✅ Currencies primary key added');

      // Add primary key to ExchangeRates
      console.log('  - Adding ExchangeRates primary key...');
      await queryInterface.addConstraint('ExchangeRates', {
        fields: ['id'],
        type: 'primary key',
        name: 'ExchangeRates_pkey',
        transaction,
      });
      console.log('  ✅ ExchangeRates primary key added');

      // Add primary key to UserExchangeRates if it exists
      if (tableNames.includes('UserExchangeRates_backup_20250918')) {
        console.log('  - Adding UserExchangeRates primary key...');
        await queryInterface.addConstraint('UserExchangeRates', {
          fields: ['id'],
          type: 'primary key',
          name: 'UserExchangeRates_pkey',
          transaction,
        });
        console.log('  ✅ UserExchangeRates primary key added');
      }

      // Recreate foreign key constraints
      console.log('  - Adding UsersCurrencies foreign key constraint...');
      await queryInterface.addConstraint('UsersCurrencies', {
        fields: ['currencyId'],
        type: 'foreign key',
        name: 'UsersCurrencies_currencyId_fkey',
        references: {
          table: 'Currencies',
          field: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      console.log('  ✅ UsersCurrencies foreign key constraint added');

      console.log(
        '  - Adding ExchangeRates baseId foreign key constraint (may take a while due to data validation)...',
      );
      await queryInterface.addConstraint('ExchangeRates', {
        fields: ['baseId'],
        type: 'foreign key',
        name: 'ExchangeRates_baseId_fkey',
        references: {
          table: 'Currencies',
          field: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      console.log('  ✅ ExchangeRates baseId foreign key constraint added');

      console.log(
        '  - Adding ExchangeRates quoteId foreign key constraint (may take a while due to data validation)...',
      );
      await queryInterface.addConstraint('ExchangeRates', {
        fields: ['quoteId'],
        type: 'foreign key',
        name: 'ExchangeRates_quoteId_fkey',
        references: {
          table: 'Currencies',
          field: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction,
      });
      console.log('  ✅ ExchangeRates quoteId foreign key constraint added');

      if (accountsHasCurrencyCode.length > 0) {
        console.log('  - Adding Accounts currencyId foreign key constraint...');
        await queryInterface.addConstraint('Accounts', {
          fields: ['currencyId'],
          type: 'foreign key',
          name: 'Accounts_currencyId_fkey',
          references: { table: 'Currencies', field: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
          transaction,
        });
        console.log('  ✅ Accounts currencyId foreign key constraint added');
      }

      if (transactionsHasCurrencyCode.length > 0) {
        console.log('  - Adding Transactions currencyId foreign key constraint...');
        await queryInterface.addConstraint('Transactions', {
          fields: ['currencyId'],
          type: 'foreign key',
          name: 'Transactions_currencyId_fkey',
          references: { table: 'Currencies', field: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
          transaction,
        });
        console.log('  ✅ Transactions currencyId foreign key constraint added');
      }

      if (portfolioBalancesHasCurrencyCode.length > 0) {
        console.log('  - Adding PortfolioBalances currencyId foreign key constraint...');
        await queryInterface.addConstraint('PortfolioBalances', {
          fields: ['currencyId'],
          type: 'foreign key',
          name: 'PortfolioBalances_currencyId_fkey',
          references: { table: 'Currencies', field: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
          transaction,
        });
        console.log('  ✅ PortfolioBalances currencyId foreign key constraint added');
      }

      if (portfolioTransfersHasCurrencyCode.length > 0) {
        console.log('  - Adding PortfolioTransfers currencyId foreign key constraint...');
        await queryInterface.addConstraint('PortfolioTransfers', {
          fields: ['currencyId'],
          type: 'foreign key',
          name: 'PortfolioTransfers_currencyId_fkey',
          references: { table: 'Currencies', field: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
          transaction,
        });
        console.log('  ✅ PortfolioTransfers currencyId foreign key constraint added');
      }

      if (tableNames.includes('UserExchangeRates_backup_20250918')) {
        console.log('  - Adding UserExchangeRates baseId foreign key constraint...');
        await queryInterface.addConstraint('UserExchangeRates', {
          fields: ['baseId'],
          type: 'foreign key',
          name: 'UserExchangeRates_baseId_fkey',
          references: {
            table: 'Currencies',
            field: 'id',
          },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
          transaction,
        });
        console.log('  ✅ UserExchangeRates baseId foreign key constraint added');

        console.log('  - Adding UserExchangeRates quoteId foreign key constraint...');
        await queryInterface.addConstraint('UserExchangeRates', {
          fields: ['quoteId'],
          type: 'foreign key',
          name: 'UserExchangeRates_quoteId_fkey',
          references: {
            table: 'Currencies',
            field: 'id',
          },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
          transaction,
        });
        console.log('  ✅ UserExchangeRates quoteId foreign key constraint added');

        console.log('  - Adding UserExchangeRates userId foreign key constraint...');
        await queryInterface.addConstraint('UserExchangeRates', {
          fields: ['userId'],
          type: 'foreign key',
          name: 'UserExchangeRates_userId_fkey',
          references: {
            table: 'Users',
            field: 'id',
          },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
          transaction,
        });
        console.log('  ✅ UserExchangeRates userId foreign key constraint added');
      }

      // ============================================================================
      // STEP 7: Restore table structure by removing currencyCode columns
      // ============================================================================
      console.log('🔧 Step 7: Removing currencyCode columns...');

      // Remove currencyCode column from UsersCurrencies if it exists
      console.log('  - Checking UsersCurrencies table...');
      const usersCurrenciesHasCurrencyCode = (await queryInterface.sequelize.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'UsersCurrencies' AND column_name = 'currencyCode'`,
        { type: QueryTypes.SELECT, transaction },
      )) as { column_name: string }[];

      if (usersCurrenciesHasCurrencyCode.length > 0) {
        console.log('  - Removing currencyCode from UsersCurrencies...');
        await queryInterface.removeColumn('UsersCurrencies', 'currencyCode', { transaction });
        console.log('  ✅ UsersCurrencies currencyCode column removed');
      }

      // Remove currencyCode column from Accounts if it exists
      if (accountsHasCurrencyCode.length > 0) {
        console.log('  - Removing currencyCode from Accounts...');
        await queryInterface.removeColumn('Accounts', 'currencyCode', { transaction });
        console.log('  ✅ Accounts currencyCode column removed');
      }

      // NOTE: currencyId column is restored in Step 5, not here

      // Remove currencyCode column from PortfolioBalances if it exists
      if (portfolioBalancesHasCurrencyCode.length > 0) {
        console.log('  - Removing currencyCode from PortfolioBalances...');
        await queryInterface.removeColumn('PortfolioBalances', 'currencyCode', { transaction });
        console.log('  ✅ PortfolioBalances currencyCode column removed');
      }

      // Remove currencyCode column from PortfolioTransfers if it exists
      if (portfolioTransfersHasCurrencyCode.length > 0) {
        console.log('  - Removing currencyCode from PortfolioTransfers...');
        await queryInterface.removeColumn('PortfolioTransfers', 'currencyCode', { transaction });
        console.log('  ✅ PortfolioTransfers currencyCode column removed');
      }

      console.log('✅ All currencyCode columns removed');

      await transaction.commit();
      console.log('🎉 Migration rollback completed successfully!');
    } catch (error) {
      console.error('❌ Migration rollback failed:', error);
      await transaction.rollback();
      throw error;
    }
  },
};
