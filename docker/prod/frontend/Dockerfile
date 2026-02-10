# 🏗️ Stage 1️⃣: Build
FROM node:23.11.0 AS build-stage

WORKDIR /app

# Copy root-level package files and post-install script
COPY package*.json ./
COPY post-install.sh ./
RUN chmod +x ./post-install.sh

# Copy package files for workspaces
COPY packages/frontend/package*.json ./packages/frontend/
COPY packages/landing/package*.json ./packages/landing/

# Install dependencies
RUN npm ci

# Copy env file that is created in CI
COPY .env.production ./

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
