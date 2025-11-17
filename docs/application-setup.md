# Local Application Setup Guide

This guide will walk you through setting up the Budget Tracker project on your local machine.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Project Architecture](#project-architecture)
- [Quick Start with Docker](#quick-start-with-docker)
- [Manual Setup (Without Docker)](#manual-setup-without-docker)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [Database Migrations](#database-migrations)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Software

- **Node.js**: v23.10.0
- **npm**: Comes with Node.js
- **Docker & Docker Compose**: For containerized development (essencial)

## Project Architecture

Budget Tracker is a monorepo with the following structure:

```
budget-tracker/
├── packages/
│   ├── backend/          # Node.js / Express.js / Sequelize / PostgreSQL / Redis backend
│   └── frontend/         # Vue 3 + Vite frontend
├── docker/
│   ├── dev/              # Development Docker configurations
│   ├── test/             # Test environment configurations
├── scripts/              # Utility scripts
└── .env.development      # Development environment variables
```

**Tech Stack:**

- **Backend**: Node.js, Express, TypeScript, Sequelize (ORM), PostgreSQL, Redis, BullMQ
- **Frontend**: Vue 3, TypeScript, Vite, Pinia, TailwindCSS, Radix Vue
- **Infrastructure**: Docker, Docker Compose, pgAdmin

## Quick Start with Docker

### 1. Clone the Repository

```bash
git clone https://github.com/letehaha/budget-tracker
cd budget-tracker
```

### 2. Install Dependencies

```bash
npm install
```

This will install all workspace dependencies for both frontend and backend packages.

### 3. Generate SSL Certificates

The development environment uses HTTPS. Generate self-signed SSL certificates:

```bash
npm run generate-ssl-certs
```

This creates certificates in `docker/dev/certs/`.

### 4. Configure Environment Variables

The project comes with a `.env.template` file. See #Environment Variables to get information about each key and how to fill/obtain it.

### 5. Start Docker Services

```bash
npm run docker:dev
```

This will:

- Build and start all Docker containers (backend, frontend, PostgreSQL, Redis, Frankfurter, pgAdmin)
- Backend will be available at `https://localhost:8081`
- Frontend will be available at `https://localhost:8100`
- pgAdmin will be available at `http://localhost:8001`

### 6. Run Database Migrations

In a new terminal, run migrations to set up the database schema:

```bash
npm run docker:dev:migrate
```

### 7. Access the Application

- **Frontend**: https://localhost:8100
- **Backend API**: https://localhost:8081
- **pgAdmin**: http://localhost:8001
  - Email: `PGADMIN_DEFAULT_EMAIL` (env variable)
  - Password: `PGADMIN_DEFAULT_PASSWORD` (env variable)

**Note**: Your browser will show a security warning due to self-signed certificates. This is expected in development - accept the certificate to proceed.

## Configuration

### Environment Variables

Key environment variables in `.env.development`:

- `NODE_ENV`: Environment (development/production/test)

**Backend Configuration:**

- `APPLICATION_HOST`: Backend host (default: 127.0.0.1)
- `APPLICATION_PORT`: Backend port (default: 8081)
- `APPLICATION_JWT_SECRET`: JWT secret for authentication

**Database Configuration:**

- `APPLICATION_DB_HOST`: PostgreSQL host. Default to `db`. Uses service name defined in the `/docker/dev/docker-compose.yml`.
- `APPLICATION_DB_PORT`: PostgreSQL port
- `APPLICATION_DB_USERNAME`: Database username (define yours)
- `APPLICATION_DB_PASSWORD`: Database password (define yours)
- `APPLICATION_DB_DATABASE`: Database name (define yours)
- `APPLICATION_DB_DIALECT`: Database dialect, default to `postgres`. Used by Sequelize. Details: https://sequelize.org/docs/v6/other-topics/dialect-specific-things/. If you wanna change it, keep in mind that different DBs support different functionality. This project is written with a full support for Postgres, other DBs support is not guaranteed
- `DB_QUERY_LOGGING`: Enable SQL query logging (true/false)

**Redis Configuration:**

- `APPLICATION_REDIS_HOST`: Redis host. Default to `redis`. Uses service name defined in the `/docker/dev/docker-compose.yml`.
- `MAP_REDIS_PORT_TO_OS_PORT`: Port mapping for local Redis access. Mostly needed for debugging, yet required to be set. Can be set to default `6379`, but to avoid conflicts with local Redis instsances, better define custom port.

**API Keys (Optional but recommended for full functionality):**

- `POLYGON_API_KEY`: Stock market data. Can be obtained at https://massive.com/ (previously polygon.io)
- `ALPHA_VANTAGE_API_KEY`: Financial data. Can be obtained at https://www.alphavantage.co/
- `FMP_API_KEY`: Financial Data API. Can be obtained at https://site.financialmodelingprep.com/
- `API_LAYER_API_KEYS`: Currency exchange rates (comma-separated for multiple keys). Can be obtained at https://marketplace.apilayer.com/fixer-api. Better define several keys
- `FRANKFURTER_BASE_URL`: Local service for exchange rates. Only `FRANKFURTER_SUPPORTED_CURRENCIES` are supported, that's why `API_LAYER_API_KEYS` is essencial to support other currencies.
- `ENABLE_BANKING_REDIRECT_URL`: OAuth redirect URL required by Enable Banking – bank integration provider.

**Frontend Configuration:**

- `HOST`: Frontend host domain (default: `localhost`)
- `PORT`: Frontend port (default: `8100`)
- `VITE_APP_API_HTTP`: Backend API URL (default: `http://127.0.0.1:8081`)
- `VITE_APP_API_VER`: API version prefix (default: `/api/v1`)

**Security:**

- `ALLOWED_ORIGINS`: CORS allowed origins (comma-separated)
- `APP_SESSION_ID_SECRET`: Session secret
- `ADMIN_USERS`: usernames of users that should be considered as admins. Admins have extra functionality available

### Database Configuration

Database configuration is managed by Sequelize. Connection settings are read from environment variables in the backend package.

## Running the Application

Most of the time the only command you will need is: `npm run docker:dev`. It will start all required services.

`npm run docker:dev:migrate` is required on the first run. Also it might be required if you decide to pull new code changes which might essentialy contain DB structure updates.

### Development Commands

Below is a quick walk-throught for all development-related commands.

```bash
npm run lint # Run linting (both packages)
npm run test # Run all tests
npm run prettier # Format code with Prettier
```

#### Backend-Specific Commands

```bash
cd packages/backend

# Start development server
npm run dev

# Build for production
npm run build

# Run production server
npm run prod

# Run tests
npm run test
npm run test:unit
npm run test:e2e

# Database migrations
npm run migrate:dev           # Run migrations (dev)
npm run migrate:dev:undo      # Undo last migration (dev)
npm run migrate:generate      # Generate new migration
```

#### Frontend-Specific Commands

```bash
cd packages/frontend

# Start development server
npm run dev

# Build for production
npm run build

# Run tests
npm run test
npm run test:unit

# Run Storybook
npm run storybook
```

## Testing

Running tests requires creating `.env.test` file which should mostly looks the same as the `.env.development` with a few critical changes. Use following values for tests:

```yml
APPLICATION_DB_HOST=test-db
APPLICATION_REDIS_HOST=test-redis

# define how many Jest workers should be used for parallel tests execution
# min: 1, max: <whatever>, but better about 70-80% of your CPU cores
JEST_WORKERS_AMOUNT=6
# define if you wanna see logger. logs in tests. Useful for debugging
SHOW_LOGS_IN_TESTS=false

# Better use `test` values to avoid calling external APIs with real credentials.
# It might drain your usage limits.
# It shouldn't happen tho
POLYGON_API_KEY=test
ALPHA_VANTAGE_API_KEY=test
FMP_API_KEY=test
API_LAYER_API_KEYS=test
```

### Running All Tests

```bash
npm run test
```

### Backend Tests

```bash
cd packages/backend

# All tests
npm run test

# Unit tests only
npm run test:unit

# E2E tests only
npm run test:e2e
```

**Note**: E2E tests automatically set up test databases and run migrations. The number of test workers is configured via `JEST_WORKERS_AMOUNT` in `.env.development`.

### Frontend Tests

```bash
cd packages/frontend

# Run unit tests
npm run test:unit
```

## Troubleshooting

### SSL Certificate Issues

**Problem**: HTTPS not working

```bash
# Regenerate certificates
npm run generate-ssl-certs

# Restart Docker services
npm run docker:dev:down
npm run docker:dev
```

### API Key Issues

**Problem**: External API features not working

- Check that API keys are set in `.env.development`
- Verify API keys are valid and have not expired
- Some features (stock market data, currency rates) require valid API keys

### pgAdmin Connection

To connect to the database from pgAdmin:

1. Open http://localhost:8001
2. Login with credentials from `.env.development`
3. Add new server:
   - **Name**: `foo_bar`
   - **Host**: `APPLICATION_DB_HOST`
   - **Port**: `APPLICATION_DB_PORT`
   - **Database**: `APPLICATION_DB_DATABASE`
   - **Username**: `APPLICATION_DB_USERNAME`
   - **Password**: `APPLICATION_DB_PASSWORD`

## Additional Resources

- **Main README**: [../README.md](../README.md)
- **License**: [../LICENSE](../LICENSE)
- **Backend README**: [packages/backend/README.md](../packages/backend/README.md)
- **Docker Compose Files**: `docker/dev/docker-compose.yml`
- **Backend Package**: `packages/backend/`
- **Frontend Package**: `packages/frontend/`

## Getting Help

If you encounter issues not covered here:

1. Check existing GitHub issues
2. Review Docker logs: `npm run docker:dev:logs`
3. Verify environment variables in `.env.development`
4. Ensure all prerequisites are installed and up-to-date
