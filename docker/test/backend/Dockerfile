FROM oven/bun:1

LABEL com.docker.compose.project=test

# Install Node.js for vitest (vitest runs on Node internally)
RUN apt-get update && apt-get install -y nodejs npm && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files. This allows Docker to cache the
# dependencies as long as these files don't change.
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
COPY post-install.sh ./
COPY docker ./docker
RUN chmod +x ./post-install.sh
RUN bun install --ignore-scripts && ./post-install.sh

# Copy source codes
COPY packages/backend ./packages/backend
COPY packages/shared ./packages/shared

# Run this command to keep container alive. Without it will be demounted right after deps installation
CMD ["tail", "-f", "/dev/null"]
