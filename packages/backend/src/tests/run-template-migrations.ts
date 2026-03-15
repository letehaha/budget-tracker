import { DataTypes, Sequelize } from '@sequelize/core';
import { PostgresDialect } from '@sequelize/postgres';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Import umzug using require for better CJS/ESM compatibility
const { Umzug, SequelizeStorage } = require('umzug');

/**
 * Standalone script to run migrations on the template database.
 * Called by setup-e2e-tests.sh before creating worker databases.
 *
 * Usage: npx tsx src/tests/run-template-migrations.ts
 */

const DATABASE_NAME = `${process.env.APPLICATION_DB_DATABASE}-template`;

console.log('='.repeat(60));
console.log('TEMPLATE MIGRATION RUNNER v2 - with TypeScript support');
console.log('='.repeat(60));

async function runMigrations() {
  console.log(`Running migrations on template database: ${DATABASE_NAME}`);

  const sequelize = new Sequelize({
    dialect: PostgresDialect,
    host: process.env.APPLICATION_DB_HOST,
    port: parseInt(process.env.APPLICATION_DB_PORT as string, 10),
    user: process.env.APPLICATION_DB_USERNAME,
    password: process.env.APPLICATION_DB_PASSWORD,
    database: DATABASE_NAME,
    logging: false,
  });

  // Create a Sequelize-like object with DataTypes for legacy migrations
  // Legacy migrations expect (queryInterface, Sequelize) where Sequelize has type definitions
  const SequelizeLegacy = {
    ...DataTypes,
    // Add any additional properties that migrations might use
    literal: sequelize.literal.bind(sequelize),
    fn: sequelize.fn.bind(sequelize),
    col: sequelize.col.bind(sequelize),
  };

  const umzug = new Umzug({
    migrations: {
      glob: path.join(__dirname, '../migrations/*.{js,ts}'),
      resolve: ({ name, path: migrationPath, context }) => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const migration = require(migrationPath!);
        return {
          name,
          up: async () => migration.up(context, SequelizeLegacy),
          down: async () => migration.down(context, SequelizeLegacy),
        };
      },
    },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize }),
    logger: console,
  });

  try {
    console.log('Starting migrations...');
    const pending = await umzug.pending();
    console.log(`Pending migrations: ${pending.length}`);
    pending.forEach((m) => console.log(`  - ${m.name}`));

    const migrations = await umzug.up();
    console.log(`Successfully ran ${migrations.length} migrations`);
    migrations.forEach((m) => console.log(`  - ${m.name}`));

    // Debug: Verify critical seed data after migrations
    const [currenciesResult] = await sequelize.query('SELECT COUNT(*) as count FROM "Currencies"');
    const [exchangeRatesResult] = await sequelize.query('SELECT COUNT(*) as count FROM "ExchangeRates"');

    console.log('[DEBUG] Currencies count:', (currenciesResult as { count: string }[])[0]?.count);
    console.log('[DEBUG] ExchangeRates count:', (exchangeRatesResult as { count: string }[])[0]?.count);

    // Close the connection and wait for it to fully complete
    // This is critical because PostgreSQL requires no active connections
    // to the template database when creating databases from it
    await sequelize.close();
    console.log('Connection closed, template database ready');

    // Give PostgreSQL a moment to fully release the connection
    // before the setup script tries to clone from this template
    await new Promise((resolve) => setTimeout(resolve, 500));
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    await sequelize.close();
    process.exit(1);
  }
}

runMigrations();
