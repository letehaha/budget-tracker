FROM oven/bun:1

# Build arg to control offline mode
ARG OFFLINE_MODE=false

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
COPY bun.lock* ./
COPY post-install.sh ./
COPY packages/backend/package*.json ./packages/backend/
COPY packages/shared/package*.json ./packages/shared/

# Copy TS configs
COPY tsconfig*.json ./
COPY packages/backend/tsconfig*.json ./packages/backend/
COPY packages/shared/tsconfig*.json ./packages/shared/

# Install dependencies
# In offline mode, skip installation (use cached layer from previous build)
RUN chmod +x ./post-install.sh
RUN if [ "$OFFLINE_MODE" = "false" ]; then \
      bun install; \
    else \
      echo "Offline mode: skipping bun install, using cached dependencies"; \
    fi

# Copy source code
COPY packages/backend ./packages/backend
COPY packages/shared ./packages/shared

ENV NODE_ENV=development

COPY docker/dev/backend/docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh
ENTRYPOINT ["/docker-entrypoint.sh"]

CMD ["bun", "run", "--cwd", "packages/backend", "dev"]
