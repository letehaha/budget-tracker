require('dotenv').config({ path: `../../.env.${process.env.NODE_ENV}` });

// Used in Sequelize migrations
module.exports = {
  [process.env.NODE_ENV]: {
    username: process.env.APPLICATION_DB_USERNAME,
    password: process.env.APPLICATION_DB_PASSWORD,
    database: process.env.APPLICATION_DB_DATABASE,
    host: process.env.APPLICATION_DB_HOST,
    port: process.env.APPLICATION_DB_PORT,
    dialect: process.env.APPLICATION_DB_DIALECT || 'postgres',
    logging: false,
  },
};
