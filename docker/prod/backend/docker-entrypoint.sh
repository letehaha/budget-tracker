#!/bin/sh
set -e

echo "Starting entrypoint script"

# Run migrations
echo "Running migrations..."
if npm run migrate; then
    echo "Migrations completed successfully"
else
    echo "Migration failed. Exiting..."
    exit 1
fi

# If we get here, migrations were successful
echo "Starting the application..."
exec "$@"
