import { config } from 'dotenv';
import { Dialect } from 'sequelize';

config({ path: `../../.env.${process.env.NODE_ENV}` });

interface DatabaseConfig {
  username: string;
  password: string;
  database: string;
  host: string;
  port: number;
  dialect: Dialect;
  logging: boolean;
}

interface Config {
  [key: string]: DatabaseConfig;
}

const databaseConfig: Config = {
  [process.env.NODE_ENV as string]: {
    username: process.env.APPLICATION_DB_USERNAME as string,
    password: process.env.APPLICATION_DB_PASSWORD as string,
    database: process.env.APPLICATION_DB_DATABASE as string,
    host: process.env.APPLICATION_DB_HOST as string,
    port: parseInt(process.env.APPLICATION_DB_PORT as string, 10),
    dialect: (process.env.APPLICATION_DB_DIALECT as Dialect) || 'postgres',
    logging: false,
  },
};

export = databaseConfig;
