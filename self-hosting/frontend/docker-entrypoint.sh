#!/bin/sh
# Renders per-container runtime configuration, then hands off to nginx.
#
# For every setting there are three sources, in precedence order:
#   1. the runtime env var (e.g. API_HTTP) — wins even when set to empty string
#   2. the baked build-time default (DEFAULT_API_HTTP, from the build ARG)
#   3. a hardcoded fallback where one applies
# `${VAR+set}` distinguishes unset from set-but-empty: an empty API_HTTP is
# meaningful (selects same-origin `/api/v1` mode) and must not fall through
# to the baked default.
set -eu

# --- Effective values -------------------------------------------------------

# resolve KEY: sets EFFECTIVE_KEY from $KEY (runtime env, wins even when set
# to empty) or $DEFAULT_KEY (baked build ARG). Keys that silently fell back to
# a non-empty baked default are collected in BAKED_KEYS and surfaced in one
# startup log line, so a bare `docker run` without compose-managed env vars
# doesn't invisibly inherit the image builder's URLs/tokens.
BAKED_KEYS=""
resolve() {
  key="$1"
  eval "runtime_is_set=\${$key+set}"
  if [ "$runtime_is_set" = "set" ]; then
    eval "EFFECTIVE_$key=\$$key"
  else
    eval "EFFECTIVE_$key=\$DEFAULT_$key"
    eval "default_value=\$DEFAULT_$key"
    if [ -n "$default_value" ]; then
      BAKED_KEYS="$BAKED_KEYS $key"
    fi
  fi
}

resolve API_HTTP
resolve API_VER
resolve MCP_BASE_URL
resolve POSTHOG_KEY
resolve POSTHOG_HOST
resolve LOGO_DEV_TOKEN
resolve SENTRY_DSN
resolve SENTRY_RELEASE
resolve CSP_EXTRA_CONNECT
resolve CSP_EXTRA_FORM_ACTION
resolve CSP_EXTRA_ANALYTICS

[ -n "$EFFECTIVE_API_VER" ] || EFFECTIVE_API_VER="/api/v1"

if [ -n "$BAKED_KEYS" ]; then
  echo "config: using baked build-time defaults for:$BAKED_KEYS (set these env vars, or set them empty, to override)"
fi

# --- Validation -------------------------------------------------------------

# A non-empty API URL must carry a scheme; without it the browser rejects it as
# a CSP source and every API call fails silently in the console. Empty is valid
# and selects same-origin mode (relative /api/v1, proxied by nginx).
case "$EFFECTIVE_API_HTTP" in
  "" ) : ;;
  http://* | https://* ) : ;;
  * )
    echo "ERROR: API_HTTP must be empty (same-origin mode) or start with http:// or https:// (got: $EFFECTIVE_API_HTTP)" >&2
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
  API_HTTP: "$(js_escape "$EFFECTIVE_API_HTTP")",
  API_VER: "$(js_escape "$EFFECTIVE_API_VER")",
  MCP_BASE_URL: "$(js_escape "$EFFECTIVE_MCP_BASE_URL")",
  POSTHOG_KEY: "$(js_escape "$EFFECTIVE_POSTHOG_KEY")",
  POSTHOG_HOST: "$(js_escape "$EFFECTIVE_POSTHOG_HOST")",
  LOGO_DEV_TOKEN: "$(js_escape "$EFFECTIVE_LOGO_DEV_TOKEN")",
  SENTRY_DSN: "$(js_escape "$EFFECTIVE_SENTRY_DSN")",
  SENTRY_RELEASE: "$(js_escape "$EFFECTIVE_SENTRY_RELEASE")",
};
EOF

# --- CSP + nginx config -----------------------------------------------------

# connect-src / form-action default to the API host so a self-hoster who only
# sets API_HTTP still gets a working CSP. The analytics slot defaults to the
# PostHog host so its requests aren't blocked when analytics is configured.
[ -n "$EFFECTIVE_CSP_EXTRA_CONNECT" ] || EFFECTIVE_CSP_EXTRA_CONNECT="$EFFECTIVE_API_HTTP"
[ -n "$EFFECTIVE_CSP_EXTRA_FORM_ACTION" ] || EFFECTIVE_CSP_EXTRA_FORM_ACTION="$EFFECTIVE_API_HTTP"
[ -n "$EFFECTIVE_CSP_EXTRA_ANALYTICS" ] || EFFECTIVE_CSP_EXTRA_ANALYTICS="$EFFECTIVE_POSTHOG_HOST"

# envsubst only touches the three named placeholders; every other `$var` in the
# template is an nginx runtime variable and must be left intact.
export CSP_EXTRA_CONNECT="$EFFECTIVE_CSP_EXTRA_CONNECT"
export CSP_EXTRA_FORM_ACTION="$EFFECTIVE_CSP_EXTRA_FORM_ACTION"
export CSP_EXTRA_ANALYTICS="$EFFECTIVE_CSP_EXTRA_ANALYTICS"
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
