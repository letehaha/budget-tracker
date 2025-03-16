// Default file that being merged with others env-related files

module.exports = {
  name: 'budget-tracker-be',
  host: process.env.APPLICATION_HOST,
  port: process.env.APPLICATION_PORT,
  apiPrefix: '/api/v1',
  jwtSecret: process.env.APPLICATION_JWT_SECRET,
  db: {
    host: process.env.APPLICATION_DB_HOST,
    username: process.env.APPLICATION_DB_USERNAME,
    password: process.env.APPLICATION_DB_PASSWORD,
    database: process.env.APPLICATION_DB_DATABASE,
    port: process.env.APPLICATION_DB_PORT,
    dialect: process.env.APPLICATION_DB_DIALECT,
    logging: true,
  },
  redis: {
    host: process.env.APPLICATION_REDIS_HOST,
  },
  bankIntegrations: {
    monobank: {
      apiEndpoint: 'https://api.monobank.ua',
    },
  },
};
