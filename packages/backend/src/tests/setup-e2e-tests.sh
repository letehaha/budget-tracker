#!/bin/bash

# Source environment variables from .env.test file in the root directory
if [ -f ../../.env.test ]; then
    export $(cat ../../.env.test | grep -v '#' | awk '/=/ {print $1}')
else
    echo ".env.test file not found in root directory"
    exit 1
fi


# Start the containers and run tests
docker compose -f ../../docker/test/backend/docker-compose.yml up --build -d

echo "Waiting a bit..."
sleep 3

# Additional checks for better debugging
echo "Waiting for Postgres to response for health check..."
docker compose -f ../../docker/test/backend/docker-compose.yml exec -T test-db pg_isready -U "${APPLICATION_DB_USERNAME}" -d "${APPLICATION_DB_DATABASE}"
echo "Waiting for Redis to response for health check..."
docker compose -f ../../docker/test/backend/docker-compose.yml exec -T test-redis redis-cli ping

echo "Creating template database..."

# Create template database and run migrations once
TEMPLATE_DB="${APPLICATION_DB_DATABASE}-template"
docker compose -f ../../docker/test/backend/docker-compose.yml exec -T test-db bash -c "
  psql -U \"${APPLICATION_DB_USERNAME}\" -d postgres -c \"DROP DATABASE IF EXISTS \\\"${TEMPLATE_DB}\\\";\"
  psql -U \"${APPLICATION_DB_USERNAME}\" -d postgres -c \"CREATE DATABASE \\\"${TEMPLATE_DB}\\\";\"
"

echo "Running migrations on template database..."
docker compose -f ../../docker/test/backend/docker-compose.yml exec -T test-runner \
  npx ts-node packages/backend/src/tests/run-template-migrations.ts

echo "Creating worker databases from template..."

# Terminate any lingering connections to the template database before cloning
# PostgreSQL requires no active connections to the template when creating databases from it
docker compose -f ../../docker/test/backend/docker-compose.yml exec -T test-db bash -c "
  psql -U \"${APPLICATION_DB_USERNAME}\" -d postgres -c \"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEMPLATE_DB}' AND pid <> pg_backend_pid();\"
"

# Small delay to ensure connections are fully terminated
sleep 1

# Verify template database has correct exchange rate count before cloning
echo "Verifying template database data..."
TEMPLATE_ER_COUNT=$(docker compose -f ../../docker/test/backend/docker-compose.yml exec -T test-db \
  psql -U "${APPLICATION_DB_USERNAME}" -d "${TEMPLATE_DB}" -t -c "SELECT COUNT(*) FROM \"ExchangeRates\";" | tr -d '[:space:]')

# Check if we got a valid number and if it's too low
if ! [[ "$TEMPLATE_ER_COUNT" =~ ^[0-9]+$ ]]; then
  echo "ERROR: Could not get valid exchange rate count from template database (got: '${TEMPLATE_ER_COUNT}')"
  exit 1
fi

if [ "$TEMPLATE_ER_COUNT" -lt 10000 ]; then
  echo "ERROR: Template database has only ${TEMPLATE_ER_COUNT} exchange rates (expected ~25281). TypeScript migrations may not have run!"
  echo "Check the migration output above for errors."
  exit 1
fi
echo "Template database verification passed."

# Create worker databases FROM the template (instant clone with full schema)
docker compose -f ../../docker/test/backend/docker-compose.yml exec -T test-db bash -c "
for i in \$(seq 1 \$JEST_WORKERS_AMOUNT); do
  psql -U \"${APPLICATION_DB_USERNAME}\" -d postgres -c \"DROP DATABASE IF EXISTS \\\"${APPLICATION_DB_DATABASE}-\$i\\\";\"
  psql -U \"${APPLICATION_DB_USERNAME}\" -d postgres -c \"CREATE DATABASE \\\"${APPLICATION_DB_DATABASE}-\$i\\\" TEMPLATE \\\"${TEMPLATE_DB}\\\";\"
done
"

# Verify all worker databases have correct data
echo "Verifying worker databases..."
docker compose -f ../../docker/test/backend/docker-compose.yml exec -T test-db bash -c "
for i in \$(seq 1 \$JEST_WORKERS_AMOUNT); do
  count=\$(psql -U \"${APPLICATION_DB_USERNAME}\" -d \"${APPLICATION_DB_DATABASE}-\$i\" -t -c \"SELECT COUNT(*) FROM \\\"ExchangeRates\\\";\" | tr -d ' ')
  echo \"Worker \$i ExchangeRates count: \$count\"
done
"

echo "Running tests..."
# Run tests
docker compose -f ../../docker/test/backend/docker-compose.yml exec -T test-runner \
  npx jest -c packages/backend/jest.config.e2e.ts --passWithNoTests --forceExit --colors "$@"

# Capture the exit code
TEST_EXIT_CODE=$?

# Clean up containers
docker compose -f ../../docker/test/backend/docker-compose.yml down -v --remove-orphans --volumes

# Clean up images
echo "Cleaning up Docker images..."
docker image prune -af --filter "label=com.docker.compose.project=test"

# Check the exit code and display an error message if it's 1
if [ $TEST_EXIT_CODE -eq 1 ]; then
    echo -e "\n\n$(tput setaf 1)ERROR: Tests failed!$(tput sgr0)"
else
    echo -e "\n\n$(tput setaf 2)Tests passed successfully.$(tput sgr0)"
fi

# Exit with the test exit code
exit $TEST_EXIT_CODE
