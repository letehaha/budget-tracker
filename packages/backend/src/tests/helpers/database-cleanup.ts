/* eslint-disable @typescript-eslint/no-explicit-any */
import { connection } from '@models/index';

/**
 * Fast database cleanup using table truncation
 */
export async function truncateAllTables(): Promise<void> {
  try {
    // Get all table names in public schema (excluding system tables and reference data tables)
    // Reference data tables are populated by migrations and contain essential application data
    const [tables] = await connection.sequelize.query(`
      SELECT string_agg('"' || table_name || '"', ', ') as table_names
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE 'pg_%'
        AND table_name != 'SequelizeMeta'
        AND table_name != 'Currencies'
        AND table_name != 'MerchantCategoryCodes';
    `);

    const tableNames = (tables as any)[0]?.table_names;

    if (!tableNames) {
      return;
    }

    // Single command to truncate all tables with CASCADE to handle foreign keys
    await connection.sequelize.query(`TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE;`);
  } catch (error: any) {
    console.error('❌ Table truncation failed:', error.message);
    throw error;
  }
}

/**
 * Fallback function to drop and recreate schema (current approach)
 * Used when truncation fails or in specific scenarios
 */
export async function recreateSchema(): Promise<void> {
  // Drop all schemas
  await connection.sequelize.drop({ cascade: true });

  // Drop enums manually as they might not be cleaned up by schema drop
  await dropAllEnums(connection.sequelize);
}

/**
 * Drop all custom enum types
 * This is a helper function from the original setup
 */
async function dropAllEnums(sequelize: any) {
  // Get all ENUM types
  const enums = await sequelize.query(`
    SELECT t.typname as enumtype
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    GROUP BY t.typname;
  `);

  // Drop each ENUM
  for (const enumType of enums[0]) {
    await sequelize.query(`DROP TYPE "${enumType.enumtype}" CASCADE`);
  }
}

/**
 * Smart cleanup function that tries truncation first, falls back to recreation
 */
export async function cleanupDatabase(): Promise<void> {
  try {
    await truncateAllTables();
  } catch (error) {
    console.warn('⚠️  Truncation failed, falling back to schema recreation');
    await recreateSchema();
  }
}
