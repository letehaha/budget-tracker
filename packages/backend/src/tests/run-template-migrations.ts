import path from 'path';
import { Sequelize } from 'sequelize-typescript';

/**
 * Standalone script to run migrations on the template database.
 * Called by setup-e2e-tests.sh before creating worker databases.
 *
 * Usage: npx ts-node src/tests/run-template-migrations.ts
 */
// Register ts-node with transpileOnly to avoid TypeScript errors across migration files
// Each migration file is an independent module, but ts-node in full type-check mode
// can report false positives for redeclared variables across files
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
  },
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Umzug = require('umzug');

const DATABASE_NAME = `${process.env.APPLICATION_DB_DATABASE}-template`;

console.log('='.repeat(60));
console.log('TEMPLATE MIGRATION RUNNER v2 - with TypeScript support');
console.log('='.repeat(60));

async function runMigrations() {
  console.log(`Running migrations on template database: ${DATABASE_NAME}`);

  const sequelize = new Sequelize({
    host: process.env.APPLICATION_DB_HOST,
    port: parseInt(process.env.APPLICATION_DB_PORT as string, 10),
    username: process.env.APPLICATION_DB_USERNAME,
    password: process.env.APPLICATION_DB_PASSWORD,
    database: DATABASE_NAME,
    dialect: 'postgres',
    logging: false,
  });

  const umzug = new Umzug({
    migrations: {
      path: path.join(__dirname, '../migrations'),
      pattern: /\.(js|ts)$/,
      params: [sequelize.getQueryInterface(), Sequelize],
    },
    storage: 'sequelize',
    storageOptions: {
      sequelize,
    },
  });

  try {
    console.log('Starting migrations...');
    const pending = await umzug.pending();
    console.log(`Pending migrations: ${pending.length}`);
    pending.forEach((m) => console.log(`  - ${m.file}`));

    const migrations = await umzug.up();
    console.log(`Successfully ran ${migrations.length} migrations`);
    migrations.forEach((m) => console.log(`  - ${m.file}`));

    // Debug: Verify critical seed data after migrations
    const [currenciesResult] = await sequelize.query('SELECT COUNT(*) as count FROM "Currencies"');
    const [exchangeRatesResult] = await sequelize.query('SELECT COUNT(*) as count FROM "ExchangeRates"');
    const [aedRatesResult] = await sequelize.query(
      `SELECT COUNT(*) as count FROM "ExchangeRates" WHERE "baseCode" = 'AED'`,
    );

    console.log('[DEBUG] Currencies count:', (currenciesResult as { count: string }[])[0]?.count);
    console.log('[DEBUG] ExchangeRates count:', (exchangeRatesResult as { count: string }[])[0]?.count);
    console.log('[DEBUG] AED ExchangeRates count:', (aedRatesResult as { count: string }[])[0]?.count);

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
