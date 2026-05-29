# 🏗️ Stage 1️⃣: Build
FROM oven/bun:1-alpine AS build-stage

WORKDIR /app

# Copy root-level package files
COPY package*.json ./
COPY bun.lock* ./
COPY post-install.sh ./
RUN chmod +x ./post-install.sh

# Copy backend package files
COPY packages/backend/package*.json ./packages/backend/

# Install all dependencies (including dev dependencies for build)
RUN bun install

# Copy the rest of the code needed for build
COPY tsconfig.json ./
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend
COPY docker/prod ./docker/prod

# Build the backend
WORKDIR /app/packages/backend
RUN bun run build

# 🚀 Stage 2️⃣: Production
FROM oven/bun:1-alpine AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 bunjs && adduser -u 1001 -G bunjs -s /bin/sh -D bunjs

# Copy only production dependencies
COPY package*.json ./
COPY bun.lock* ./
COPY post-install.sh ./
RUN chmod +x ./post-install.sh

COPY packages/backend/package*.json ./packages/backend/
RUN bun install --production

COPY --from=build-stage /app/tsconfig.json ./

# Copy built backend code and shared files
COPY --from=build-stage /app/packages/backend/dist ./packages/backend/dist
COPY --from=build-stage /app/packages/backend/package.json ./packages/backend/package.json

# Copy migration files and runner for production migrations
COPY --from=build-stage /app/packages/backend/src/migrations ./packages/backend/src/migrations
COPY --from=build-stage /app/packages/backend/src/resources ./packages/backend/src/resources

# Copy and prepare entrypoint script
COPY docker/prod/backend/docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh

# Set ownership to non-root user
RUN chown -R bunjs:bunjs /app

# Set working directory to backend
WORKDIR /app/packages/backend

# Switch to non-root user
USER bunjs

# Set environment to production
ENV NODE_ENV=production

# Sentry release tracking (passed as build arg)
ARG SENTRY_RELEASE
ENV SENTRY_RELEASE=$SENTRY_RELEASE

ENTRYPOINT ["/docker-entrypoint.sh"]

# Run the compiled app
CMD ["bun", "dist/app.js"]
