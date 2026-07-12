# 🏗️ Stage 1️⃣: Build
# --platform=$BUILDPLATFORM: this stage emits only static files (Vite SPA +
# Astro landing), nothing arch-specific — so multi-arch builds run the heavy
# JS build once natively instead of emulating it under QEMU per target arch.
# The production nginx stage stays flag-less so it builds per target arch.
FROM --platform=$BUILDPLATFORM node:23.11.0 AS build-stage

WORKDIR /app

# Build inputs are passed as ARGs (compose interpolates them from the user's
# self-hosting/.env, auto-loaded beside the compose file). That env file itself
# is NEVER copied into the image — it contains DB passwords + auth secrets that
# must not leak into pushed image layers.
ARG VITE_APP_API_HTTP
ARG VITE_APP_API_VER=/api/v1
ARG VITE_MCP_BASE_URL=
ARG VITE_POSTHOG_KEY=
ARG VITE_POSTHOG_HOST=
ARG VITE_LOGO_DEV_TOKEN=
ARG VITE_SENTRY_DSN=
ARG VITE_SENTRY_RELEASE=
ARG VITE_APP_COMMIT_HASH=
ARG SENTRY_AUTH_TOKEN=
ARG SENTRY_ORG=
ARG SENTRY_PROJECT=

# Hard-fail early if a non-empty API URL is scheme-less. Without scheme
# (https://) the browser silently rejects it as a CSP source — every API
# call would fail in the browser console with no server-side signal.
# Empty is valid: it bakes same-origin mode (relative /api/v1 URLs), the
# default for self-hosters who build from source and proxy via BACKEND_URL.
RUN case "$VITE_APP_API_HTTP" in ""|https://*|http://*) ;; *) echo "ERROR: VITE_APP_API_HTTP must be empty (same-origin mode) or include scheme (https://...)" && exit 1 ;; esac

# Copy root-level package files and post-install script
COPY package*.json ./
COPY post-install.sh ./
RUN chmod +x ./post-install.sh

# Copy package files for workspaces
COPY packages/frontend/package*.json ./packages/frontend/
COPY packages/landing/package*.json ./packages/landing/

# Install dependencies
RUN npm ci

# Materialize a minimal .env.production from build args. vite.config.js does
# loadEnv from /app, so it picks these up at build time. Only VITE_* values
# end up inlined into the bundle (Vite's prefix filter for client-side env).
# These VITE_* values are the baked build-time defaults; the runtime config
# shim (window.__APP_CONFIG__) can override them per-container without a rebuild.
RUN printf '%s\n' \
    "VITE_APP_API_HTTP=$VITE_APP_API_HTTP" \
    "VITE_APP_API_VER=$VITE_APP_API_VER" \
    "VITE_MCP_BASE_URL=$VITE_MCP_BASE_URL" \
    "VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY" \
    "VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST" \
    "VITE_LOGO_DEV_TOKEN=$VITE_LOGO_DEV_TOKEN" \
    "VITE_SENTRY_DSN=$VITE_SENTRY_DSN" \
    "VITE_SENTRY_RELEASE=$VITE_SENTRY_RELEASE" \
    "VITE_APP_COMMIT_HASH=$VITE_APP_COMMIT_HASH" \
    "SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN" \
    "SENTRY_ORG=$SENTRY_ORG" \
    "SENTRY_PROJECT=$SENTRY_PROJECT" \
    > /app/.env.production

# Copy the rest of the code
COPY tsconfig.json ./
COPY packages/shared ./packages/shared
COPY packages/frontend ./packages/frontend
COPY packages/landing ./packages/landing

# Build frontend SPA
WORKDIR /app/packages/frontend
RUN npm run build

# Build Astro landing
WORKDIR /app/packages/landing
RUN npm run build

# 🚀 Stage 2️⃣: Production
FROM nginx:1.27-alpine AS production-stage

# Build-time defaults for every runtime-configurable value. The container
# entrypoint reads these as the fallback when the matching runtime env var is
# unset (env var set, even to empty string, wins over the baked default).
ARG VITE_APP_API_HTTP
ARG VITE_APP_API_VER=/api/v1
ARG VITE_MCP_BASE_URL=
ARG VITE_POSTHOG_KEY=
ARG VITE_POSTHOG_HOST=
ARG VITE_LOGO_DEV_TOKEN=
ARG VITE_SENTRY_DSN=
ARG VITE_SENTRY_RELEASE=
ARG CSP_EXTRA_CONNECT=
ARG CSP_EXTRA_FORM_ACTION=
ARG CSP_EXTRA_ANALYTICS=

ENV DEFAULT_API_HTTP=$VITE_APP_API_HTTP
ENV DEFAULT_API_VER=$VITE_APP_API_VER
ENV DEFAULT_MCP_BASE_URL=$VITE_MCP_BASE_URL
ENV DEFAULT_POSTHOG_KEY=$VITE_POSTHOG_KEY
ENV DEFAULT_POSTHOG_HOST=$VITE_POSTHOG_HOST
ENV DEFAULT_LOGO_DEV_TOKEN=$VITE_LOGO_DEV_TOKEN
ENV DEFAULT_SENTRY_DSN=$VITE_SENTRY_DSN
ENV DEFAULT_SENTRY_RELEASE=$VITE_SENTRY_RELEASE
ENV DEFAULT_CSP_EXTRA_CONNECT=$CSP_EXTRA_CONNECT
ENV DEFAULT_CSP_EXTRA_FORM_ACTION=$CSP_EXTRA_FORM_ACTION
ENV DEFAULT_CSP_EXTRA_ANALYTICS=$CSP_EXTRA_ANALYTICS

# envsubst (gettext) renders CSP placeholders into nginx.conf at container start.
RUN apk add --no-cache gettext

# Create app directories with proper permissions
RUN mkdir -p /app /landing /etc/nginx/includes /etc/nginx/templates \
    && touch /etc/nginx/nginx.conf \
    && chown nginx:nginx /app /landing /etc/nginx/includes /etc/nginx/nginx.conf

# Copy built assets
COPY --from=build-stage --chown=nginx:nginx /app/packages/frontend/dist /app
COPY --from=build-stage --chown=nginx:nginx /app/packages/landing/dist /landing

# nginx.conf is a template here: the entrypoint envsubst's the CSP placeholders
# with the effective runtime values before nginx reads it.
COPY --chown=nginx:nginx packages/frontend/nginx.conf /etc/nginx/templates/nginx.conf.template

COPY self-hosting/frontend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Use non-root user
USER nginx

EXPOSE 80

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
