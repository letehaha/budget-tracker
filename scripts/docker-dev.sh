#!/usr/bin/env bash
#
# Wrapper around `docker compose` for the dev environment that makes every git
# worktree run its own isolated stack (containers, volumes/DB, host ports).
#
# How it works:
#   - The main checkout keeps the compose project name `dev` and the default
#     ports from .env.development, so nothing changes there (existing volumes
#     and DB data stay attached).
#   - A linked worktree gets a unique compose project name derived from its
#     directory name, and a set of free host ports. The ports plus all
#     port-derived env vars (VITE_APP_API_HTTP, ALLOWED_ORIGINS, BETTER_AUTH_URL,
#     AUTH_ORIGIN, ENABLE_BANKING_REDIRECT_URL) are written once to
#     .env.development.local (gitignored) so they stay stable across runs.
#   - A linked worktree also gets a unique BETTER_AUTH_COOKIE_PREFIX. Auth cookies
#     are keyed by host, not port, and every worktree shares `localhost`, so
#     without distinct prefixes a login in one worktree overwrites another's
#     session cookie. The main checkout keeps the default prefix (bt_auth).
#
# Custom ports: pass FRONTEND_PORT / BACKEND_PORT (and optionally DB_PORT,
# REDIS_PORT, CURRENCY_RATES_PORT, PGADMIN_PORT) on the first run, or any run —
# explicit values regenerate .env.development.local:
#   FRONTEND_PORT=9100 BACKEND_PORT=9081 npm run docker:dev
# To re-roll auto-assigned ports, delete .env.development.local and rerun.
#
# Usage: scripts/docker-dev.sh <docker compose args>, e.g. `up`, `down`, `logs -f`.
# DOCKER_DEV_COMPOSE_FILE overrides the compose file (used by docker:dev:frontend).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="${DOCKER_DEV_COMPOSE_FILE:-$ROOT/docker/dev/docker-compose.yml}"
BASE_ENV="$ROOT/.env.development"
LOCAL_ENV="$ROOT/.env.development.local"

if [[ ! -f "$BASE_ENV" ]]; then
  echo "error: $BASE_ENV not found. Copy .env.template to .env.development first." >&2
  exit 1
fi

read_var() { # read_var FILE NAME -> value (last assignment wins, like dotenv)
  grep -E "^$2=" "$1" | tail -1 | cut -d= -f2- || true
}

port_free() { # true when nothing listens on 127.0.0.1:$1
  ! nc -z 127.0.0.1 "$1" >/dev/null 2>&1
}

# --- Resolve compose project name ---------------------------------------------
# When not a git checkout at all (e.g. a release tarball), behave like the main
# checkout: default project name and the ports from .env.development as-is.
GIT_DIR="$(git -C "$ROOT" rev-parse --git-dir 2>/dev/null || echo .git)"
GIT_COMMON_DIR="$(git -C "$ROOT" rev-parse --git-common-dir 2>/dev/null || echo .git)"

if [[ "$GIT_DIR" == "$GIT_COMMON_DIR" ]]; then
  # Main checkout: keep the historical project name so existing containers and
  # volumes (dev_db_data etc.) stay attached.
  PROJECT="dev"
  IS_MAIN=1
else
  PROJECT="bt-$(basename "$ROOT" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '-' | sed -e 's/-\{2,\}/-/g' -e 's/^-//' -e 's/-$//')"
  IS_MAIN=0
fi

# --- Generate .env.development.local when needed ------------------------------
EXPLICIT_PORTS=0
[[ -n "${FRONTEND_PORT:-}${BACKEND_PORT:-}${DB_PORT:-}${REDIS_PORT:-}${CURRENCY_RATES_PORT:-}${PGADMIN_PORT:-}" ]] && EXPLICIT_PORTS=1

NEEDS_LOCAL_ENV=0
if [[ "$EXPLICIT_PORTS" == 1 ]]; then
  NEEDS_LOCAL_ENV=1 # explicit ports always regenerate
elif [[ "$IS_MAIN" == 0 && ! -f "$LOCAL_ENV" ]]; then
  NEEDS_LOCAL_ENV=1 # first run in a worktree: auto-assign
fi

if [[ "$NEEDS_LOCAL_ENV" == 1 ]]; then
  BASE_BE="$(read_var "$BASE_ENV" APPLICATION_PORT)"
  BASE_FE="$(read_var "$BASE_ENV" PORT)"

  # Auto-assignment uses a contiguous block of 6 ports: a slot is picked
  # deterministically from the project name, then probed upwards until the
  # whole block is free.
  AUTO_BASE=""
  if [[ -z "${FRONTEND_PORT:-}" || -z "${BACKEND_PORT:-}" || -z "${DB_PORT:-}" || -z "${REDIS_PORT:-}" || -z "${CURRENCY_RATES_PORT:-}" || -z "${PGADMIN_PORT:-}" ]]; then
    slot=$(($(printf %s "$PROJECT" | cksum | cut -d' ' -f1) % 200))
    for _ in $(seq 0 199); do
      candidate=$((18000 + slot * 10))
      ok=1
      for i in 0 1 2 3 4 5; do
        port_free $((candidate + i)) || { ok=0; break; }
      done
      if [[ "$ok" == 1 ]]; then
        AUTO_BASE=$candidate
        break
      fi
      slot=$(((slot + 1) % 200))
    done
    if [[ -z "$AUTO_BASE" ]]; then
      echo "error: could not find a free block of ports in 18000-20000" >&2
      exit 1
    fi
  fi

  FE="${FRONTEND_PORT:-$((AUTO_BASE + 0))}"
  BE="${BACKEND_PORT:-$((AUTO_BASE + 1))}"
  DB="${DB_PORT:-$((AUTO_BASE + 2))}"
  REDIS="${REDIS_PORT:-$((AUTO_BASE + 3))}"
  CUR="${CURRENCY_RATES_PORT:-$((AUTO_BASE + 4))}"
  PGA="${PGADMIN_PORT:-$((AUTO_BASE + 5))}"

  rewrite_ports() { # swap the base frontend/backend ports inside URL-ish vars
    printf %s "$1" | sed -e "s/:${BASE_BE}/:${BE}/g" -e "s/:${BASE_FE}/:${FE}/g"
  }

  VITE_APP_API_HTTP="$(rewrite_ports "$(read_var "$BASE_ENV" VITE_APP_API_HTTP)")"
  BETTER_AUTH_URL="$(rewrite_ports "$(read_var "$BASE_ENV" BETTER_AUTH_URL)")"
  AUTH_ORIGIN="$(rewrite_ports "$(read_var "$BASE_ENV" AUTH_ORIGIN)")"
  ENABLE_BANKING_REDIRECT_URL="$(rewrite_ports "$(read_var "$BASE_ENV" ENABLE_BANKING_REDIRECT_URL)")"
  ALLOWED_ORIGINS="$(read_var "$BASE_ENV" ALLOWED_ORIGINS),https://localhost:${FE},https://127.0.0.1:${FE}"

  cat > "$LOCAL_ENV" <<EOF
# Generated by scripts/docker-dev.sh — per-worktree dev stack overrides.
# Safe to edit; delete the file to re-generate with fresh auto-assigned ports.
COMPOSE_PROJECT_NAME=${PROJECT}
PORT=${FE}
APPLICATION_PORT=${BE}
MAP_DB_PORT_TO_OS_PORT=${DB}
MAP_REDIS_PORT_TO_OS_PORT=${REDIS}
MAP_CURRENCY_RATES_PORT_TO_OS_PORT=${CUR}
MAP_PGADMIN_PORT_TO_OS_PORT=${PGA}
VITE_APP_API_HTTP=${VITE_APP_API_HTTP}
BETTER_AUTH_URL=${BETTER_AUTH_URL}
AUTH_ORIGIN=${AUTH_ORIGIN}
BETTER_AUTH_COOKIE_PREFIX=bt_auth_${BE}
ENABLE_BANKING_REDIRECT_URL=${ENABLE_BANKING_REDIRECT_URL}
ALLOWED_ORIGINS=${ALLOWED_ORIGINS}
EOF

  echo "Generated $LOCAL_ENV" >&2
fi

# --- Ensure SSL certs exist ----------------------------------------------------
# certs/ is gitignored, so fresh worktrees don't have it. Without certs Vite and
# the backend silently fall back to plain HTTP and the https:// URLs printed
# below just refuse to connect.
case "${1:-}" in
  up | restart)
    if [[ ! -f "$ROOT/docker/dev/certs/cert.pem" ]]; then
      echo "SSL certs missing — running scripts/generate-ssl-certs.sh ..." >&2
      (cd "$ROOT" && bash scripts/generate-ssl-certs.sh)
    fi
    ;;
esac

# --- Run docker compose --------------------------------------------------------
export COMPOSE_PROJECT_NAME="$PROJECT"

ARGS=(-f "$COMPOSE_FILE" --env-file "$BASE_ENV")
if [[ -f "$LOCAL_ENV" ]]; then
  ARGS+=(--env-file "$LOCAL_ENV")
  echo "[$PROJECT] frontend: https://localhost:$(read_var "$LOCAL_ENV" PORT)  backend: https://localhost:$(read_var "$LOCAL_ENV" APPLICATION_PORT)" >&2
else
  echo "[$PROJECT] frontend: https://localhost:$(read_var "$BASE_ENV" PORT)  backend: https://localhost:$(read_var "$BASE_ENV" APPLICATION_PORT)" >&2
fi

exec docker compose "${ARGS[@]}" "$@"
