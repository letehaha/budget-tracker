FROM node:23.11.0-alpine

WORKDIR /app

# Copy root-level package files and post-install script
COPY package*.json ./
COPY post-install.sh ./
RUN chmod +x ./post-install.sh

# Copy backend package files
COPY packages/backend/package*.json ./packages/backend/

# Install all dependencies (including dev dependencies)
RUN npm ci

# Copy the rest of the code
COPY tsconfig.json ./
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend
COPY docker/prod ./docker/prod

# Set working directory to backend
WORKDIR /app/packages/backend

# Set environment to prod
ENV NODE_ENV=production

CMD ["/bin/sh", "-c", "npm run prod"]
