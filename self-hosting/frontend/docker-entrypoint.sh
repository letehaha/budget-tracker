#!/bin/sh
# Renders per-container runtime configuration, then hands off to nginx.
#
# Every setting comes from the container's runtime env; unset behaves the same
# as empty (empty API_HTTP selects same-origin `/api/v1` mode). The single
# exception is SENTRY_RELEASE: it falls back to the value baked at build time
# (DEFAULT_SENTRY_RELEASE) because the release must match the source maps CI
# uploaded for this exact bundle — a per-deployment override would detach
# Sentry events from their source maps.
set -eu

# --- Effective values -------------------------------------------------------

API_HTTP="${API_HTTP:-}"
API_VER="${API_VER:-/api/v1}"
MCP_BASE_URL="${MCP_BASE_URL:-}"
POSTHOG_KEY="${POSTHOG_KEY:-}"
POSTHOG_HOST="${POSTHOG_HOST:-}"
LOGO_DEV_TOKEN="${LOGO_DEV_TOKEN:-}"
SENTRY_DSN="${SENTRY_DSN:-}"
SENTRY_RELEASE="${SENTRY_RELEASE:-${DEFAULT_SENTRY_RELEASE:-}}"
CSP_EXTRA_CONNECT="${CSP_EXTRA_CONNECT:-}"
CSP_EXTRA_FORM_ACTION="${CSP_EXTRA_FORM_ACTION:-}"
CSP_EXTRA_ANALYTICS="${CSP_EXTRA_ANALYTICS:-}"

# --- Validation -------------------------------------------------------------

# A non-empty API URL must carry a scheme; without it the browser rejects it as
# a CSP source and every API call fails silently in the console. Empty is valid
# and selects same-origin mode (relative /api/v1, proxied by nginx).
case "$API_HTTP" in
  "" ) : ;;
  http://* | https://* ) : ;;
  * )
    echo "ERROR: API_HTTP must be empty (same-origin mode) or start with http:// or https:// (got: $API_HTTP)" >&2
    exit 1
    ;;
esac

# BACKEND_URL feeds nginx proxy_pass. A trailing slash gives proxy_pass a URI
# part, which makes nginx replace the matched /api/ prefix instead of passing
# it through — strip it so /api/v1/... reaches the backend intact.
if [ -n "${BACKEND_URL-}" ]; then
  case "$BACKEND_URL" in
    http://* | https://* ) : ;;
    * )
      echo "ERROR: BACKEND_URL must start with http:// or https:// (got: $BACKEND_URL)" >&2
      exit 1
      ;;
  esac
  BACKEND_URL="${BACKEND_URL%/}"
fi

# --- Runtime config shim ----------------------------------------------------

# Escape a value for embedding inside a JS double-quoted string literal.
# CR/LF are stripped first: a raw newline in an env value would produce an
# unterminated string literal and break all of config.js.
js_escape() {
  printf '%s' "$1" | tr -d '\r\n' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

cat > /app/config.js <<EOF
window.__APP_CONFIG__ = {
  API_HTTP: "$(js_escape "$API_HTTP")",
  API_VER: "$(js_escape "$API_VER")",
  MCP_BASE_URL: "$(js_escape "$MCP_BASE_URL")",
  POSTHOG_KEY: "$(js_escape "$POSTHOG_KEY")",
  POSTHOG_HOST: "$(js_escape "$POSTHOG_HOST")",
  LOGO_DEV_TOKEN: "$(js_escape "$LOGO_DEV_TOKEN")",
  SENTRY_DSN: "$(js_escape "$SENTRY_DSN")",
  SENTRY_RELEASE: "$(js_escape "$SENTRY_RELEASE")",
};
EOF

# --- CSP + nginx config -----------------------------------------------------

# connect-src / form-action default to the API host so a self-hoster who only
# sets API_HTTP still gets a working CSP. The analytics slot defaults to the
# PostHog host so its requests aren't blocked when analytics is configured.
[ -n "$CSP_EXTRA_CONNECT" ] || CSP_EXTRA_CONNECT="$API_HTTP"
[ -n "$CSP_EXTRA_FORM_ACTION" ] || CSP_EXTRA_FORM_ACTION="$API_HTTP"
[ -n "$CSP_EXTRA_ANALYTICS" ] || CSP_EXTRA_ANALYTICS="$POSTHOG_HOST"

# envsubst only touches the three named placeholders; every other `$var` in the
# template is an nginx runtime variable and must be left intact.
export CSP_EXTRA_CONNECT CSP_EXTRA_FORM_ACTION CSP_EXTRA_ANALYTICS
envsubst '$CSP_EXTRA_CONNECT $CSP_EXTRA_FORM_ACTION $CSP_EXTRA_ANALYTICS' \
  < /etc/nginx/templates/nginx.conf.template \
  > /etc/nginx/nginx.conf

# --- Conditional /api reverse proxy -----------------------------------------

# Only emit the proxy block when BACKEND_URL is set (same-origin deployments).
# An unconditional proxy_pass to an unresolvable host crashes nginx at startup,
# so deployments that talk to the API cross-origin get an empty include.
API_PROXY_INCLUDE="/etc/nginx/includes/api-proxy.conf"
if [ -n "${BACKEND_URL-}" ]; then
  cat > "$API_PROXY_INCLUDE" <<EOF
location /api/ {
  proxy_pass ${BACKEND_URL};
  proxy_http_version 1.1;
  proxy_set_header Host \$host;
  proxy_set_header X-Real-IP \$remote_addr;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto \$scheme;
  proxy_set_header X-Forwarded-Host \$host;
  proxy_set_header Connection "";
  # Backend streams Server-Sent Events; buffering would stall them.
  proxy_buffering off;
  proxy_read_timeout 3600s;
}
EOF
else
  : > "$API_PROXY_INCLUDE"
fi

exec "$@"
