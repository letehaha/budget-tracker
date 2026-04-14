# 🏗️ Stage 1️⃣: Build
FROM node:23.11.0 AS build-stage

WORKDIR /app

# Build args for VITE env vars (used by Railway and other hosted platforms).
# When .env.production is provided (e.g. by CI), these are ignored.
ARG VITE_APP_API_HTTP
ARG VITE_APP_API_VER=/api/v1
ARG VITE_MCP_BASE_URL=
ARG VITE_LOGO_DEV_TOKEN=
ARG VITE_POSTHOG_KEY=
ARG VITE_POSTHOG_HOST=
ARG VITE_SENTRY_DSN=
ARG VITE_SENTRY_RELEASE=

# Copy root-level package files and post-install script
COPY package*.json ./
COPY post-install.sh ./
RUN chmod +x ./post-install.sh

# Copy package files for workspaces
COPY packages/frontend/package*.json ./packages/frontend/
COPY packages/landing/package*.json ./packages/landing/

# Install dependencies
RUN npm ci

# Copy env file if it exists (CI creates it before build).
# If not present (e.g. Railway), generate it from build args.
COPY .env.productio[n] ./
RUN if [ ! -f .env.production ]; then \
      printf "VITE_APP_API_HTTP=%s\nVITE_APP_API_VER=%s\nVITE_MCP_BASE_URL=%s\nVITE_LOGO_DEV_TOKEN=%s\nVITE_POSTHOG_KEY=%s\nVITE_POSTHOG_HOST=%s\nVITE_SENTRY_DSN=%s\nVITE_SENTRY_RELEASE=%s\n" \
        "$VITE_APP_API_HTTP" "$VITE_APP_API_VER" "$VITE_MCP_BASE_URL" "$VITE_LOGO_DEV_TOKEN" \
        "$VITE_POSTHOG_KEY" "$VITE_POSTHOG_HOST" "$VITE_SENTRY_DSN" "$VITE_SENTRY_RELEASE" \
        > .env.production; \
    fi

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

# Create app directories with proper permissions
RUN mkdir /app /landing && chown nginx:nginx /app /landing

# Copy built assets
COPY --from=build-stage --chown=nginx:nginx /app/packages/frontend/dist /app
COPY --from=build-stage --chown=nginx:nginx /app/packages/landing/dist /landing
COPY --chown=nginx:nginx packages/frontend/nginx.conf /etc/nginx/nginx.conf

# Use non-root user
USER nginx

EXPOSE 80
