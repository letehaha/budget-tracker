#!/bin/sh
set -e

echo "Starting entrypoint script"

# Run migrations (for now disabled since not sure it's needed)
# echo "Running migrations..."
# if npm run -w packages/backend migrate:dev; then
#     echo "Migrations completed successfully"
# else
#     echo "Migration failed. Exiting..."
#     exit 1
# fi

# If we get here, migrations were successful
echo "Starting the application..."
exec "$@"
