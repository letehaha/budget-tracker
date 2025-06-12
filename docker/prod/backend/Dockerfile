# 🏗️ Stage 1️⃣: Build
FROM node:23.11.0-alpine AS build-stage

WORKDIR /app

# Copy root-level package files
COPY package*.json ./
COPY post-install.sh ./
RUN chmod +x ./post-install.sh

# Copy backend package files
COPY packages/backend/package*.json ./packages/backend/

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy the rest of the code needed for build
COPY tsconfig.json ./
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend
COPY docker/prod ./docker/prod

# Build the backend
WORKDIR /app/packages/backend
RUN npm run build

# 🚀 Stage 2️⃣: Production
FROM node:23.11.0-alpine AS production

WORKDIR /app

# Copy only production dependencies
COPY package*.json ./
COPY post-install.sh ./
RUN chmod +x ./post-install.sh

COPY packages/backend/package*.json ./packages/backend/
RUN npm ci

COPY --from=build-stage /app/tsconfig.json ./

# Copy built backend code and shared files
COPY --from=build-stage /app/packages/backend/dist ./packages/backend/dist
COPY --from=build-stage /app/packages/backend/package.json ./packages/backend/package.json

# Copy .sequelizerc and config folder
COPY --from=build-stage /app/packages/backend/.sequelizerc ./packages/backend/.sequelizerc
COPY --from=build-stage /app/packages/backend/config ./packages/backend/config
COPY --from=build-stage /app/packages/backend/src/migrations ./packages/backend/src/migrations

# Copy and prepare entrypoint script
COPY docker/prod/backend/docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh
ENTRYPOINT ["/docker-entrypoint.sh"]

# Set working directory to backend
WORKDIR /app/packages/backend

# Set environment to production
ENV NODE_ENV=production

# Run the compiled app
CMD ["node", "--enable-source-maps", "dist/app.js"]
