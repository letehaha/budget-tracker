# Frontend Deployment Flow

This document explains how the frontend application is built and containerized for deployment.

## Overview

The frontend uses a **two-stage Docker build** to create an optimized production image with nginx serving static files.

## Architecture

````
User Request
    ↓
Reverse Proxy (handles SSL, domain routing)
    ↓
Frontend Docker Container (port 80)
    ↓
Nginx Web Server
    ↓
Static Files (built application)

## Docker Build Process

### Build Stage (Node.js)

**Dockerfile location:** `docker/prod/frontend/Dockerfile`

1. **Base image:** `node:23.11.0`
2. **Install dependencies:** `npm ci` (clean install from package-lock.json)
3. **Copy source code:** All frontend source files and shared packages
4. **Build application:** `npm run build` in `packages/frontend`
5. **Output:** Static files in `packages/frontend/dist`

### Production Stage (Nginx)

1. **Base image:** `nginx:latest`
2. **Copy built files:** Static files from build stage → `/app`
3. **Copy nginx config:** `packages/frontend/nginx.conf` → `/etc/nginx/nginx.conf`
4. **Result:** Minimal production image (~50MB vs ~1GB with Node.js)

**Why two stages?**
- **Smaller image size:** Only nginx + static files, no Node.js or build tools
- **Better security:** No development dependencies in production
- **Faster deployments:** Less data to transfer and start

## Nginx Configuration

**File location:** `packages/frontend/nginx.conf`

```nginx
server {
  listen       80;
  server_name  _;  # Default catch-all
  location / {
    root   /app;
    index  index.html;
    try_files $uri $uri/ /index.html;  # SPA routing support
  }
}
````

**Key points:**

- `listen 80`: Nginx listens internally on port 80 (container port)
- `server_name _`: Default catch-all server (accepts any hostname)
- `try_files $uri $uri/ /index.html`: Enables client-side routing for single-page apps

**Note:** When using a reverse proxy (like Traefik, Nginx Proxy Manager, Caddy), the `server_name` directive doesn't matter since routing happens at the proxy layer.
