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

**Dockerfile location:** `self-hosting/frontend/Dockerfile`

1. **Base image:** `node:23.11.0`
2. **Install dependencies:** `npm ci` (clean install from package-lock.json)
3. **Copy source code:** All frontend source files and shared packages
4. **Build application:** `npm run build` in `packages/frontend`
5. **Output:** Static files in `packages/frontend/dist`

### Production Stage (Nginx)

1. **Base image:** `nginx:1.27-alpine`
2. **Copy built files:** SPA from build stage → `/app`, Astro landing → `/landing`
3. **Copy nginx config as a template:** `packages/frontend/nginx.conf` → `/etc/nginx/templates/nginx.conf.template` (rendered at container start, see below)
4. **Copy the entrypoint:** `self-hosting/frontend/docker-entrypoint.sh`
5. **Runs as the non-root `nginx` user**
6. **Result:** Minimal production image (~50MB vs ~1GB with Node.js)

**Why two stages?**
- **Smaller image size:** Only nginx + static files, no Node.js or build tools
- **Better security:** No development dependencies in production
- **Faster deployments:** Less data to transfer and start

## Runtime Configuration

The image is configured **at container start**, not only at build time, so one
published image can be deployed with different settings without a rebuild.
`self-hosting/frontend/docker-entrypoint.sh` runs before nginx and:

1. **Writes `/config.js` (and `/landing/config.js`)** exposing
   `window.__APP_CONFIG__` — `API_HTTP`, `API_VER`, `MCP_BASE_URL`, PostHog,
   logo.dev, and Sentry values read from the container's env. The SPA reads
   these at runtime. An empty `API_HTTP` selects **same-origin** mode (relative
   `/api/v1`). `config.js` is served `no-store`, so a reload picks up changes.
2. **Renders the CSP into `nginx.conf`** via `envsubst`, filling
   `CSP_EXTRA_CONNECT` / `CSP_EXTRA_FORM_ACTION` / `CSP_EXTRA_ANALYTICS`
   (defaults derived from the API and analytics hosts when unset).
3. **Emits a conditional `/api` reverse-proxy block** when `BACKEND_URL` is set,
   so nginx proxies `/api/` to the backend on the internal network (same-origin
   deployments). SSE is passed through unbuffered.

Each runtime value falls back to a **baked build-time default** when its env var
is unset: the Dockerfile's `VITE_*` build args become `DEFAULT_*` env vars that
the entrypoint reads as fallbacks. A set-but-empty env var wins over the baked
default (an empty `API_HTTP` is meaningful). So `VITE_*` build args are now only
defaults — the source of truth in production is the container's runtime env.

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

The snippet above is the SPA-serving core; the shipped `nginx.conf` is a
**template** that also carries the CSP header (with `envsubst` placeholders) and
`include`s the runtime-generated `/api` reverse-proxy block. Both are filled in
by the entrypoint before nginx starts — see [Runtime Configuration](#runtime-configuration).

**Note:** When fronting this container with a reverse proxy (Nginx Proxy Manager, Caddy, the bundled Traefik overlay, …), the `server_name` directive doesn't matter since routing happens at the proxy layer. The container is also fine to expose directly on its published port with no proxy.
