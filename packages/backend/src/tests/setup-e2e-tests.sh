#!/bin/bash

# Source environment variables from .env.test file
if [ -f .env.test ]; then
    export $(cat .env.test | grep -v '#' | awk '/=/ {print $1}')
else
    echo ".env.test file not found"
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

echo "Creating databases..."

# Drop and create back databases. Amount of them based on JEST_WORKERS_AMOUNT env variable
docker compose -f ../../docker/test/backend/docker-compose.yml exec -T test-db bash -c "
for i in \$(seq 1 \$JEST_WORKERS_AMOUNT); do
  psql -U \"${APPLICATION_DB_USERNAME}\" -d postgres -c \"DROP DATABASE IF EXISTS \\\"${APPLICATION_DB_DATABASE}-\$i\\\";\"
  psql -U \"${APPLICATION_DB_USERNAME}\" -d postgres -c \"CREATE DATABASE \\\"${APPLICATION_DB_DATABASE}-\$i\\\";\"
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
