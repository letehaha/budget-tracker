FROM oven/bun:1.3.5

# Build arg to control offline mode
ARG OFFLINE_MODE=false

WORKDIR /app

# Copy only what's needed to install dependencies
COPY package*.json ./
COPY bun.lock* ./
COPY tsconfig.json ./
COPY post-install.sh ./

# Install shared and frontend package.json files separately to leverage Docker cache
COPY packages/shared/package*.json ./packages/shared/
COPY packages/frontend/package*.json ./packages/frontend/

RUN chmod +x ./post-install.sh

# Install dependencies with Bun (the repo's package manager). Producing the same
# node_modules layout Bun creates on the host keeps Vite's transitive resolution
# intact — a host (bun) / container (npm) layout mismatch was breaking Vite's
# `fdir` import. --ignore-scripts skips the git-only postinstall hook.
# In offline mode, skip installation (use cached layer from previous build).
RUN if [ "$OFFLINE_MODE" = "false" ]; then \
      bun install --ignore-scripts; \
    else \
      echo "Offline mode: skipping bun install, using cached dependencies"; \
    fi

# Now copy the rest of the code
COPY packages/shared ./packages/shared
COPY packages/frontend ./packages/frontend
COPY docker/dev ./docker/dev

COPY docker/dev/frontend/docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh
ENTRYPOINT ["/docker-entrypoint.sh"]

CMD ["bun", "run", "--cwd", "packages/frontend", "dev"]
