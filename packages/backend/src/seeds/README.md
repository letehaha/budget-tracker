# Database Seeding

This directory contains database seeding logic separated from migrations for better performance and maintainability.

## Overview

Seeds are responsible for populating the database with initial data, while migrations handle only schema changes. This separation provides:

- **Faster tests**: Migrations run quickly (schema-only), then seeds run separately
- **Better maintainability**: Data and schema concerns are separated
- **Idempotent operations**: Seeds can be run multiple times safely
- **Environment-specific data**: Different data sets for dev/test/prod

## Available Seeds

- **`currencies.seed.ts`**: Populates currency codes from `currency-codes` package
- **`mcc.seed.ts`**: Populates merchant category codes from JSON resource
- **`index.ts`**: Main orchestrator for all seeding operations

## Usage

### Manual Seeding (Development)
```bash
npm run seed              # Development environment
npm run seed:test         # Test environment  
npm run seed:prod         # Production environment
```

### Automatic Seeding (Tests)
Seeds run automatically during test setup after migrations in `setupIntegrationTests.ts`.

## Adding New Seeds

1. Create a new seed file: `src/seeds/your-seed.seed.ts`
2. Export your seed function following the pattern:
   ```typescript
   export const seedYourData = async (queryInterface: QueryInterface): Promise<void> => {
     // Check if data exists to avoid duplicates
     // Insert data using queryInterface.bulkInsert()
   }
   ```
3. Add your seed to `src/seeds/index.ts`:
   ```typescript
   import { seedYourData } from './your-seed.seed';
   
   export const seedDatabase = async (queryInterface, environment) => {
     await seedCurrencies(queryInterface);
     await seedMerchantCategoryCodes(queryInterface);
     await seedYourData(queryInterface); // Add here
   }
   ```

## Environment-Specific Seeding

Seeds can behave differently based on environment:

```typescript
export const seedDatabase = async (queryInterface, environment) => {
  // Always seed base data
  await seedCurrencies(queryInterface);
  
  if (environment === 'development') {
    // Development-specific seeds
    await seedDemoUsers(queryInterface);
  }
  
  if (environment === 'test') {
    // Minimal test data
    await seedMinimalTestData(queryInterface);
  }
}
```

## Best Practices

- **Idempotent**: Always check if data exists before inserting
- **Transactional**: Use database transactions for atomic operations
- **Performant**: Use `bulkInsert()` for large datasets
- **Minimal in tests**: Only seed essential data for test environments
- **Environment-aware**: Tailor data sets for each environment