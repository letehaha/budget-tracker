#!/bin/sh
set -e

echo "Starting entrypoint script"

# Guard against the .env.production.example placeholder values being left
# unchanged. A self-hoster who copies the example file and forgets to fill
# in secrets would otherwise get a stack that boots with a known dummy key.
for var in APPLICATION_JWT_SECRET APP_SESSION_ID_SECRET BETTER_AUTH_SECRET APPLICATION_DB_PASSWORD; do
    eval "value=\"\$$var\""
    case "$value" in
        __REPLACE_ME__*)
            echo "ERROR: $var is still set to the placeholder '__REPLACE_ME__'."
            echo "Generate a real value (openssl rand -base64 32) and update .env.production."
            exit 1
            ;;
    esac
done

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
