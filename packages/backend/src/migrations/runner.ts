import { DataTypes, Sequelize } from '@sequelize/core';
import { PostgresDialect } from '@sequelize/postgres';
import dotenv from 'dotenv';
import path from 'path';
import { Umzug, SequelizeStorage } from 'umzug';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPath = path.join(__dirname, `../../../../.env.${process.env.NODE_ENV}`);
dotenv.config({ path: envPath });

const command = process.argv[2] as 'up' | 'down' | 'pending' | undefined;

if (!command || !['up', 'down', 'pending'].includes(command)) {
  console.error('Usage: bun src/migrations/runner.ts <up|down|pending>');
  process.exit(1);
}

// Provide DataTypes and helpers that legacy CJS migrations expect as the second argument
const SequelizeLegacy = {
  ...DataTypes,
  literal: undefined as unknown, // Set after sequelize is created
  fn: undefined as unknown,
  col: undefined as unknown,
};

async function run() {
  const sequelize = new Sequelize({
    dialect: PostgresDialect,
    host: process.env.APPLICATION_DB_HOST,
    port: parseInt(process.env.APPLICATION_DB_PORT as string, 10),
    user: process.env.APPLICATION_DB_USERNAME,
    password: process.env.APPLICATION_DB_PASSWORD,
    database: process.env.APPLICATION_DB_DATABASE,
    logging: false,
  });

  SequelizeLegacy.literal = sequelize.literal.bind(sequelize);
  SequelizeLegacy.fn = sequelize.fn.bind(sequelize);
  SequelizeLegacy.col = sequelize.col.bind(sequelize);

  const umzug = new Umzug({
    migrations: {
      glob: path.join(__dirname, './[0-9]*.{cjs,ts}'),
      resolve: ({ name, path: migrationPath, context }) => {
        return {
          name,
          up: async () => {
            const migration = await import(migrationPath!);
            const mod = migration.default || migration;
            return mod.up(context, SequelizeLegacy);
          },
          down: async () => {
            const migration = await import(migrationPath!);
            const mod = migration.default || migration;
            return mod.down(context, SequelizeLegacy);
          },
        };
      },
    },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize }),
    logger: console,
  });

  try {
    if (command === 'pending') {
      const pending = await umzug.pending();
      console.log(`Pending migrations: ${pending.length}`);
      pending.forEach((m) => console.log(`  - ${m.name}`));
    } else if (command === 'up') {
      const migrations = await umzug.up();
      console.log(`Successfully ran ${migrations.length} migrations`);
      migrations.forEach((m) => console.log(`  - ${m.name}`));
    } else if (command === 'down') {
      const migrations = await umzug.down();
      console.log(`Successfully reverted 1 migration`);
      migrations.forEach((m) => console.log(`  - ${m.name}`));
    }
  } catch (error) {
    console.error('Migration failed:', error);
    await sequelize.close();
    process.exit(1);
  }

  await sequelize.close();
  process.exit(0);
}

run();
