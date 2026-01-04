#!/bin/bash
#
# Restore database from a backup dump
# Run this from the project root directory
#
# Usage:
#   chmod +x ./scripts/restore-backup.sh
#   ./scripts/restore-backup.sh path/to/backup.sql.gz
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Check if backup file is provided
if [[ -z "$1" ]]; then
    echo -e "${RED}Error:${NC} Please provide a backup file path"
    echo ""
    echo "Usage: $0 <backup-file.sql[.gz]>"
    echo ""
    echo "Examples:"
    echo "  $0 ./backup.sql.gz"
    echo "  $0 ./backup.sql"
    echo "  $0 ~/Downloads/db_backup_20251223_222254.sql.gz"
    exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [[ ! -f "$BACKUP_FILE" ]]; then
    echo -e "${RED}Error:${NC} Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Check if it's a gzipped file
IS_GZIPPED=true
if [[ "$BACKUP_FILE" != *.gz ]]; then
    IS_GZIPPED=false
    echo -e "${YELLOW}Note:${NC} File doesn't have .gz extension. Will restore as raw SQL."
fi

cd "$PROJECT_DIR"

# Load environment variables
ENV_FILE=".env.development"
if [[ ! -f "$ENV_FILE" ]]; then
    echo -e "${RED}Error:${NC} $ENV_FILE not found in project root"
    exit 1
fi

set -a
source "$ENV_FILE"
set +a

COMPOSE_FILE="docker/dev/docker-compose.yml"

echo ""
echo "=============================================="
echo "  Database Restore Script"
echo "=============================================="
echo ""
echo -e "Backup file: ${GREEN}$BACKUP_FILE${NC}"
echo -e "Database:    ${GREEN}$APPLICATION_DB_DATABASE${NC}"
echo -e "User:        ${GREEN}$APPLICATION_DB_USERNAME${NC}"
echo ""

# Confirm before proceeding
echo -e "${YELLOW}WARNING: This will DROP the existing database and replace it with the backup!${NC}"
read -p "Are you sure you want to continue? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

# Check if database container is running
echo ""
echo -e "${YELLOW}[1/4]${NC} Checking database container..."

if ! docker compose -f "$COMPOSE_FILE" ps db 2>/dev/null | grep -q "Up"; then
    echo "Starting database container..."
    docker compose -f "$COMPOSE_FILE" up -d db
    sleep 3
fi

echo -e "${GREEN}✓${NC} Database container is running"

# Drop existing database
echo ""
echo -e "${YELLOW}[2/4]${NC} Dropping existing database..."

docker compose -f "$COMPOSE_FILE" exec -T db \
    psql -U "$APPLICATION_DB_USERNAME" -d postgres \
    -c "DROP DATABASE IF EXISTS \"$APPLICATION_DB_DATABASE\";"

echo -e "${GREEN}✓${NC} Database dropped"

# Create new database
echo ""
echo -e "${YELLOW}[3/4]${NC} Creating new database..."

docker compose -f "$COMPOSE_FILE" exec -T db \
    psql -U "$APPLICATION_DB_USERNAME" -d postgres \
    -c "CREATE DATABASE \"$APPLICATION_DB_DATABASE\";"

echo -e "${GREEN}✓${NC} Database created"

# Restore from backup
echo ""
echo -e "${YELLOW}[4/4]${NC} Restoring from backup (this may take a moment)..."

if [[ "$IS_GZIPPED" == true ]]; then
    gunzip -c "$BACKUP_FILE" | docker compose -f "$COMPOSE_FILE" exec -T db \
        psql -U "$APPLICATION_DB_USERNAME" -d "$APPLICATION_DB_DATABASE" --quiet
else
    cat "$BACKUP_FILE" | docker compose -f "$COMPOSE_FILE" exec -T db \
        psql -U "$APPLICATION_DB_USERNAME" -d "$APPLICATION_DB_DATABASE" --quiet
fi

echo -e "${GREEN}✓${NC} Backup restored"

echo ""
echo "=============================================="
echo -e "${GREEN}  Database restored successfully!${NC}"
echo "=============================================="
echo ""
