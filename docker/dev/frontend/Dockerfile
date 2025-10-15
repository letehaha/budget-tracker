FROM node:23.11.0

# Build arg to control offline mode
ARG OFFLINE_MODE=false

WORKDIR /app

# Copy only what's needed to install dependencies
COPY package*.json ./
COPY tsconfig.json ./
COPY post-install.sh ./

# Install shared and frontend package.json files separately to leverage Docker cache
COPY packages/shared/package*.json ./packages/shared/
COPY packages/frontend/package*.json ./packages/frontend/

RUN chmod +x ./post-install.sh

# Install dependencies
# Error: Cannot find module @rollup/rollup-linux-arm64-gnu. npm has a bug
# related to optional dependencies (https://github.com/npm/cli/issues/4828).
# Here we're removing package-lock and installing packages as we need
# In offline mode, skip installation (use cached layer from previous build)
RUN if [ "$OFFLINE_MODE" = "false" ]; then \
      rm -rf package-lock.json node_modules && \
      npm install; \
    else \
      echo "Offline mode: skipping npm install, using cached dependencies"; \
    fi

# Now copy the rest of the code
COPY packages/shared ./packages/shared
COPY packages/frontend ./packages/frontend
COPY docker/dev ./docker/dev

CMD ["npm", "run", "-w", "packages/frontend", "dev"]
