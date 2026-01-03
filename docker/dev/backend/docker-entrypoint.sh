#!/bin/sh
set -e

echo "Starting entrypoint script"

# Check if dependencies need to be updated
# This handles the case where package.json changes but the named volume has old node_modules
LOCK_HASH_FILE="/app/packages/backend/node_modules/.package-lock-hash"
CURRENT_HASH=$(md5sum /app/package-lock.json 2>/dev/null | cut -d' ' -f1 || echo "no-lock-file")

if [ -f "$LOCK_HASH_FILE" ]; then
    STORED_HASH=$(cat "$LOCK_HASH_FILE")
else
    STORED_HASH=""
fi

if [ "$CURRENT_HASH" != "$STORED_HASH" ]; then
    echo "Dependencies changed, running npm install..."
    npm install
    echo "$CURRENT_HASH" > "$LOCK_HASH_FILE"
    echo "Dependencies updated successfully"
else
    echo "Dependencies are up to date"
fi

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
