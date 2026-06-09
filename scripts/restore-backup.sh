#!/bin/bash
#
# Restore database from a backup dump
# Run this from the project root directory
#
# Usage:
#   chmod +x ./scripts/restore-backup.sh
#   ./scripts/restore-backup.sh [path/to/backup.sql.gz | r2-filename.sql.gz]
#
# Argument resolution:
#   - If the argument points to an existing local file, that file is used.
#   - Otherwise, it is treated as a filename in the R2 backup bucket and
#     downloaded (the file is deleted after restore).
#   - If no argument is provided, the latest dump is downloaded from CF R2.
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

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

DOWNLOADED_FILE=""

cleanup_download() {
    if [[ -n "$DOWNLOADED_FILE" && -f "$DOWNLOADED_FILE" ]]; then
        echo ""
        echo -e "Cleaning up downloaded dump..."
        rm -f "$DOWNLOADED_FILE"
        echo -e "${GREEN}✓${NC} Downloaded dump deleted"
    fi
}

trap cleanup_download EXIT

setup_r2() {
    if [[ -z "$R2_ENDPOINT_URL" || -z "$R2_ACCESS_KEY_ID" || -z "$R2_SECRET_ACCESS_KEY" || -z "$R2_BACKUP_BUCKET" ]]; then
        echo -e "${RED}Error:${NC} R2 configuration is incomplete in $ENV_FILE"
        echo "Required vars: R2_ENDPOINT_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BACKUP_BUCKET"
        exit 1
    fi

    if ! command -v aws &> /dev/null; then
        echo -e "${RED}Error:${NC} aws CLI is not installed. Install it with: brew install awscli"
        exit 1
    fi

    export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
    export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
    export AWS_DEFAULT_REGION="auto"
}

if [[ -n "$1" && -f "$1" ]]; then
    BACKUP_FILE="$1"
elif [[ -n "$1" ]]; then
    # Treat the argument as a filename in the R2 backup bucket
    echo ""
    echo -e "${YELLOW}Local file not found. Treating '$1' as an R2 filename...${NC}"

    setup_r2

    R2_PREFIX="${R2_BACKUP_PREFIX:-}"
    R2_KEY="${R2_PREFIX}$1"

    DOWNLOADED_FILE="/tmp/$(basename "$1")"

    echo "Downloading s3://$R2_BACKUP_BUCKET/$R2_KEY ..."

    if ! aws s3 cp "s3://$R2_BACKUP_BUCKET/$R2_KEY" "$DOWNLOADED_FILE" \
        --endpoint-url "$R2_ENDPOINT_URL"; then
        echo -e "${RED}Error:${NC} Failed to download '$1' from R2. Check the filename and R2_BACKUP_PREFIX."
        exit 1
    fi

    echo -e "${GREEN}✓${NC} Downloaded to $DOWNLOADED_FILE"

    BACKUP_FILE="$DOWNLOADED_FILE"
else
    # Download the latest dump from R2
    echo ""
    echo -e "${YELLOW}No local file provided. Downloading latest dump from R2...${NC}"

    setup_r2

    R2_PREFIX="${R2_BACKUP_PREFIX:-}"

    echo "Listing backups in s3://$R2_BACKUP_BUCKET/$R2_PREFIX ..."

    LATEST_KEY=$(aws s3 ls "s3://$R2_BACKUP_BUCKET/$R2_PREFIX" \
        --endpoint-url "$R2_ENDPOINT_URL" \
        | grep '\.sql\(\.gz\)\?$' \
        | sort | tail -n 1 | awk '{print $4}')

    if [[ -z "$LATEST_KEY" ]]; then
        echo -e "${RED}Error:${NC} No dump files found in the bucket"
        exit 1
    fi

    echo -e "Latest dump: ${GREEN}${LATEST_KEY}${NC}"

    DOWNLOADED_FILE="/tmp/$LATEST_KEY"

    aws s3 cp "s3://$R2_BACKUP_BUCKET/${R2_PREFIX}${LATEST_KEY}" "$DOWNLOADED_FILE" \
        --endpoint-url "$R2_ENDPOINT_URL"

    echo -e "${GREEN}✓${NC} Downloaded to $DOWNLOADED_FILE"

    BACKUP_FILE="$DOWNLOADED_FILE"
fi

# Check if it's a gzipped file
IS_GZIPPED=true
if [[ "$BACKUP_FILE" != *.gz ]]; then
    IS_GZIPPED=false
    echo -e "${YELLOW}Note:${NC} File doesn't have .gz extension. Will restore as raw SQL."
fi

# Route through docker-dev.sh so the restore targets THIS worktree's stack
# (its compose project name and ports), not whichever stack claimed the
# default `dev` project name.
compose() {
    bash "$SCRIPT_DIR/docker-dev.sh" "$@"
}

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

if ! compose ps db 2>/dev/null | grep -q "Up"; then
    echo "Starting database container..."
    compose up -d db
    sleep 3
fi

echo -e "${GREEN}✓${NC} Database container is running"

# Drop existing database
echo ""
echo -e "${YELLOW}[2/4]${NC} Dropping existing database..."

compose exec -T db \
    psql -U "$APPLICATION_DB_USERNAME" -d postgres \
    -c "DROP DATABASE IF EXISTS \"$APPLICATION_DB_DATABASE\" WITH (FORCE);"

echo -e "${GREEN}✓${NC} Database dropped"

# Create new database
echo ""
echo -e "${YELLOW}[3/4]${NC} Creating new database..."

compose exec -T db \
    psql -U "$APPLICATION_DB_USERNAME" -d postgres \
    -c "CREATE DATABASE \"$APPLICATION_DB_DATABASE\";"

echo -e "${GREEN}✓${NC} Database created"

# Restore from backup
echo ""
echo -e "${YELLOW}[4/4]${NC} Restoring from backup (this may take a moment)..."

if [[ "$IS_GZIPPED" == true ]]; then
    gunzip -c "$BACKUP_FILE" | compose exec -T db \
        psql -U "$APPLICATION_DB_USERNAME" -d "$APPLICATION_DB_DATABASE" --quiet
else
    cat "$BACKUP_FILE" | compose exec -T db \
        psql -U "$APPLICATION_DB_USERNAME" -d "$APPLICATION_DB_DATABASE" --quiet
fi

echo -e "${GREEN}✓${NC} Backup restored"

echo ""
echo "=============================================="
echo -e "${GREEN}  Database restored successfully!${NC}"
echo "=============================================="
echo ""
