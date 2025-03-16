import cls from 'cls-hooked';
import config from 'config';
import { Sequelize } from 'sequelize-typescript';

export const namespace = cls.createNamespace('budget-tracker-namespace');
Sequelize.useCLS(namespace);

const connection: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sequelize?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Sequelize?: any;
} = {};

const DBConfig: Record<string, unknown> = config.get('db');

console.log('DBConfig', DBConfig);

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
