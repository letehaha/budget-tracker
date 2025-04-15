import cls from 'cls-hooked';
import { Sequelize } from 'sequelize-typescript';

export const namespace = cls.createNamespace('budget-tracker-namespace');
Sequelize.useCLS(namespace);

const connection: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sequelize?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Sequelize?: any;
} = {};

const DBConfig: Record<string, unknown> = {
  host: process.env.APPLICATION_DB_HOST,
  username: process.env.APPLICATION_DB_USERNAME,
  password: process.env.APPLICATION_DB_PASSWORD,
  database: process.env.APPLICATION_DB_DATABASE,
  port: process.env.APPLICATION_DB_PORT,
  dialect: process.env.APPLICATION_DB_DIALECT,
  logging: true,
};

const sequelize = new Sequelize({
  ...DBConfig,
  database:
    process.env.NODE_ENV === 'test'
      ? `${DBConfig.database}-${process.env.JEST_WORKER_ID}`
      : (DBConfig.database as string),
  models: [__dirname + '/**/*.model.ts'],
  pool: {
    max: 50,
    evict: 10000,
  },
  logging: process.env.NODE_ENV === 'production',
});

if (process.env.NODE_ENV === 'defelopment') {
  console.log('DBConfig', DBConfig);
}

connection.sequelize = sequelize;
connection.Sequelize = Sequelize;

export { connection };
