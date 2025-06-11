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
  [process.env.NODE_ENV]: {
    username: process.env.APPLICATION_DB_USERNAME,
    password: process.env.APPLICATION_DB_PASSWORD,
    database: process.env.APPLICATION_DB_DATABASE,
    host: process.env.APPLICATION_DB_HOST,
    port: parseInt(process.env.APPLICATION_DB_PORT, 10),
    dialect: (process.env.APPLICATION_DB_DIALECT as Dialect) || 'postgres',
    logging: false,
  },
};

export = databaseConfig;
