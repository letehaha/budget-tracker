# 🏗️ Stage 1️⃣: Build
FROM node:23.11.0-alpine AS build-stage
WORKDIR /app

# Install build dependencies for native modules (node-gyp)
RUN apk add --no-cache python3 make g++

# Copy root-level package files and post-install script
COPY package*.json ./
COPY post-install.sh ./
RUN chmod +x ./post-install.sh

# Copy frontend package files
COPY packages/frontend/package*.json ./packages/frontend/

# Install dependencies
RUN npm ci

# Copy env file that is created in CI
COPY .env.production ./

# Copy the rest of the code
COPY tsconfig.json ./
COPY packages/shared ./packages/shared
COPY packages/frontend ./packages/frontend
COPY docker/prod ./docker/prod

# Set working directory to frontend before build
WORKDIR /app/packages/frontend
RUN npm run build

# 🚀 Stage 2️⃣: Production
FROM nginx:1.27-alpine AS production-stage

# Create app directory with proper permissions
RUN mkdir /app && chown nginx:nginx /app

# Copy built assets
COPY --from=build-stage --chown=nginx:nginx /app/packages/frontend/dist /app
COPY --chown=nginx:nginx packages/frontend/nginx.conf /etc/nginx/nginx.conf

# Use non-root user
USER nginx

EXPOSE 80
