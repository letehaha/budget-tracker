## End-to-End (E2E) Tests Setup

The e2e tests setup is designed to efficiently run tests in parallel using multiple databases. Below is a detailed description of the setup process and necessary configurations.

### Overview

The current implementation of E2E tests uses multiple databases to facilitate parallel test execution. Since each test expects that it will work with the fresh empty DB, we need to empty it before each test suite. Without multiple DBs, it means we can run tests only sequentially.

### Jest Configuration

We use Jest as our testing framework and have defined `JEST_WORKERS_AMOUNT` workers to run the tests in parallel. Each worker requires a separate database instance.

You can toggle logs displaying when runnin tests using `SHOW_LOGS_IN_TESTS` env variable (`true` or `false`).

### Database Setup

For each Jest worker, a corresponding database is created with the naming convention `{APPLICATION_DB_DATABASE}-{n}`, where `n` is the worker ID. This worker ID ranges exactly as `{1...JEST_WORKERS_AMOUNT}`.

### Database Connection

The database connection is specified in the src/models/index.ts file. Here, we dynamically assign the database name based on the Jest worker ID.

```ts
database: process.env.NODE_ENV === 'test'
  ? `${DBConfig.database}-${process.env.JEST_WORKER_ID}`
  : (DBConfig.database as string),
```

### Redis Connection

To run tests correctly we also need to set keys per-worker and empty worker-related keys before each test. Prefix for worker is being managed by `redisKeyFormatter`, and emptying logic is stored in the `src/tests/setupIntegrationTests.ts`. Info is just FYI, no additional actions required.

### Docker Integration

To simplify the setup and avoid conflicts with the local environment, we use Docker to manage our databases and the application.

The application is also containerized. We run our tests from within this Docker container to ensure it can communicate with the database containers.

All Docker configs for tests are stored under `./docker/test/` directory.
