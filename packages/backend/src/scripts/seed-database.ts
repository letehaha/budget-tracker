#!/usr/bin/env ts-node
import { connection } from '@models/index';

import { seedDatabase } from '../seeds';

/**
 * Database seeding script
 * Usage: npm run seed [environment]
 * Examples:
 *   npm run seed              # Seeds development environment
 *   npm run seed:test         # Seeds test environment
 *   npm run seed:prod         # Seeds production environment
 */

const main = async () => {
  // Get environment from command line args or default to development
  const environment = (process.argv[2] as 'development' | 'production' | 'test') || 'development';

  try {
    // Wait for database connection
    await connection.sequelize.authenticate();

    // Get query interface
    const queryInterface = connection.sequelize.getQueryInterface();

    // Run seeding
    await seedDatabase(queryInterface, environment);

    process.exit(0);
  } catch (error) {
    console.error('💥 Database seeding failed:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Seeding interrupted by user');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Seeding terminated');
  process.exit(1);
});

// Run the script
if (require.main === module) {
  main();
}
