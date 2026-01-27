# 🏗️ Stage 1️⃣: Build (with Puppeteer/Chrome for prerendering)
FROM ghcr.io/puppeteer/puppeteer:24.2.0 AS build-stage

# Switch to root for installing dependencies
USER root
WORKDIR /app

# Install build dependencies for native modules (node-gyp)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

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

# Enable prerendering (Chrome is available in this Puppeteer image)
ENV ENABLE_PRERENDER=true
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
