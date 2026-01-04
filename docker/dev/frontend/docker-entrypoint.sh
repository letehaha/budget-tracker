#!/bin/sh
set -e

echo "Starting frontend entrypoint script"

# Check if dependencies need to be updated
# This handles the case where package.json changes but the named volume has old node_modules
LOCK_HASH_FILE="/app/packages/frontend/node_modules/.package-lock-hash"
CURRENT_HASH=$(md5sum /app/package-lock.json 2>/dev/null | cut -d' ' -f1 || echo "no-lock-file")

if [ -f "$LOCK_HASH_FILE" ]; then
    STORED_HASH=$(cat "$LOCK_HASH_FILE")
else
    STORED_HASH=""
fi

if [ "$CURRENT_HASH" != "$STORED_HASH" ]; then
    echo "Dependencies changed, running npm install..."
    npm install --legacy-peer-deps
    echo "$CURRENT_HASH" > "$LOCK_HASH_FILE"
    echo "Dependencies updated successfully"
else
    echo "Dependencies are up to date"
fi

echo "Starting the application..."
exec "$@"
