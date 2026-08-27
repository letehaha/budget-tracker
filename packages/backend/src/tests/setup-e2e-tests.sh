#!/bin/bash

# Source environment variables from .env.test file in the root directory
if [ -f ../../.env.test ]; then
    export $(cat ../../.env.test | grep -v '#' | awk '/=/ {print $1}')
else
    echo ".env.test file not found in root directory"
    exit 1
fi

# Namespace the docker compose project by the worktree basename so multiple
# worktrees get their own containers/volumes and do not destroy each other's
# template DB / worker DBs / images.
WORKTREE_ID=$(basename "$(cd ../.. && pwd)")
export COMPOSE_PROJECT_NAME="bt-test-${WORKTREE_ID}"
echo "Using COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME}"

compose() {
  docker compose -f ../../docker/test/backend/docker-compose.yml "$@"
}

# CI prebuilds the test-runner image with buildx layer caching and passes its tag
# in TEST_RUNNER_IMAGE; locally compose builds it under a per-worktree name.
if [ -n "${TEST_RUNNER_IMAGE:-}" ]; then
  BUILD_FLAG="--no-build"
else
  BUILD_FLAG="--build"
fi
export TEST_RUNNER_IMAGE="${TEST_RUNNER_IMAGE:-${COMPOSE_PROJECT_NAME}-test-runner}"

compose up ${BUILD_FLAG} -d

wait_for() {
  for _ in $(seq 1 120); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep 0.5
  done
  echo "ERROR: timed out waiting for: $*"
  return 1
}

echo "Waiting for Postgres health check..."
# -h 127.0.0.1 is load-bearing: during initdb the postgres image runs a socket-only
# bootstrap server that answers pg_isready over the socket and then shuts down, so a
# socket check passes before the real server exists.
wait_for compose exec -T test-db pg_isready -h 127.0.0.1 -U "${APPLICATION_DB_USERNAME}" -d "${APPLICATION_DB_DATABASE}" || exit 1
echo "Waiting for Redis health check..."
wait_for compose exec -T test-redis redis-cli ping || exit 1

TEMPLATE_DB="${APPLICATION_DB_DATABASE}-template"

recreate_template_db() {
  compose exec -T test-db bash -c "
    psql -U \"${APPLICATION_DB_USERNAME}\" -d postgres -c \"DROP DATABASE IF EXISTS \\\"${TEMPLATE_DB}\\\";\"
    psql -U \"${APPLICATION_DB_USERNAME}\" -d postgres -c \"CREATE DATABASE \\\"${TEMPLATE_DB}\\\";\"
  " || { echo "ERROR: could not create template database \"${TEMPLATE_DB}\" — is Postgres up?"; exit 1; }
}

echo "Creating template database..."
recreate_template_db

# On CI the workflow restores a pg_dump of the migrated template keyed on the
# migration files (see check-source-code.yml); restoring it replaces the full
# migration run. A failed restore falls back to migrations, and the
# ExchangeRates guard below vets the template no matter which path built it.
DUMP_FILE=./.e2e-template-cache/template.dump
RESTORED=""
if [ -n "${CI:-}" ] && [ -f "$DUMP_FILE" ]; then
  echo "Restoring template database from cached dump..."
  if compose exec -T test-db pg_restore -U "${APPLICATION_DB_USERNAME}" -d "${TEMPLATE_DB}" < "$DUMP_FILE"; then
    RESTORED=1
  else
    echo "WARNING: pg_restore of cached dump failed; falling back to migrations"
    recreate_template_db
  fi
fi

if [ -z "$RESTORED" ]; then
  echo "Running migrations on template database..."
  compose exec -T test-runner \
    npx ts-node packages/backend/src/tests/run-template-migrations.ts
fi

echo "Creating worker databases from template..."

# Terminate any lingering connections to the template database before cloning
# PostgreSQL requires no active connections to the template when creating databases from it
compose exec -T test-db bash -c "
  psql -U \"${APPLICATION_DB_USERNAME}\" -d postgres -c \"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEMPLATE_DB}' AND pid <> pg_backend_pid();\"
"

echo "Waiting for template database connections to close..."
for _ in $(seq 1 20); do
  TEMPLATE_CONNS=$(compose exec -T test-db psql -U "${APPLICATION_DB_USERNAME}" -d postgres -t \
    -c "SELECT COUNT(*) FROM pg_stat_activity WHERE datname = '${TEMPLATE_DB}';" | tr -d '[:space:]')
  [ "$TEMPLATE_CONNS" = "0" ] && break
  sleep 0.5
done

# Verify template database has correct exchange rate count before cloning
echo "Verifying template database data..."
TEMPLATE_ER_COUNT=$(compose exec -T test-db \
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

# Seed the CI dump cache only from a template that just passed verification. A
# failed pg_dump must not leave a partial file behind — a later run would
# restore it as if it were complete.
if [ -n "${CI:-}" ] && [ ! -f "$DUMP_FILE" ]; then
  echo "Writing template database dump for CI cache..."
  mkdir -p "$(dirname "$DUMP_FILE")"
  if ! compose exec -T test-db pg_dump -U "${APPLICATION_DB_USERNAME}" -Fc "${TEMPLATE_DB}" > "$DUMP_FILE"; then
    echo "WARNING: template dump failed; cache will not be seeded"
    rm -f "$DUMP_FILE"
  fi
fi

# Create worker databases FROM the template (instant clone with full schema)
compose exec -T test-db bash -c "
for i in \$(seq 1 \$JEST_WORKERS_AMOUNT); do
  psql -U \"${APPLICATION_DB_USERNAME}\" -d postgres -c \"DROP DATABASE IF EXISTS \\\"${APPLICATION_DB_DATABASE}-\$i\\\";\"
  psql -U \"${APPLICATION_DB_USERNAME}\" -d postgres -c \"CREATE DATABASE \\\"${APPLICATION_DB_DATABASE}-\$i\\\" TEMPLATE \\\"${TEMPLATE_DB}\\\";\"
done
"

# Verify all worker databases have correct data
echo "Verifying worker databases..."
compose exec -T test-db bash -c "
for i in \$(seq 1 \$JEST_WORKERS_AMOUNT); do
  count=\$(psql -U \"${APPLICATION_DB_USERNAME}\" -d \"${APPLICATION_DB_DATABASE}-\$i\" -t -c \"SELECT COUNT(*) FROM \\\"ExchangeRates\\\";\" | tr -d ' ')
  echo \"Worker \$i ExchangeRates count: \$count\"
done
"

echo "Running tests..."
# Run tests
# Forward SHOW_LOGS_IN_TESTS from the host so application logs (otherwise gated
# off inside the container) surface during e2e debugging. Unset by default.
compose exec -T \
  -e SHOW_LOGS_IN_TESTS="${SHOW_LOGS_IN_TESTS:-}" test-runner \
  npx jest -c packages/backend/jest.config.e2e.ts --passWithNoTests --forceExit --colors "$@"

# Capture the exit code
TEST_EXIT_CODE=$?

# Ephemeral CI runners need no cleanup. Locally, remove this worktree's
# containers/volumes plus its test-runner image (scoped by COMPOSE_PROJECT_NAME,
# so parallel runs from other worktrees are unaffected).
if [ -z "${CI:-}" ]; then
  compose down -v --remove-orphans --volumes --rmi local
fi

# Check the exit code and display an error message if it's 1
if [ $TEST_EXIT_CODE -eq 1 ]; then
    echo -e "\n\n$(tput setaf 1)ERROR: Tests failed!$(tput sgr0)"
else
    echo -e "\n\n$(tput setaf 2)Tests passed successfully.$(tput sgr0)"
fi

# Exit with the test exit code
exit $TEST_EXIT_CODE
