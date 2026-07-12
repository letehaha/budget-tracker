# Environment Variable Reference

Grouped as in `.env.example`. Only the REQUIRED block is needed to
boot; everything else is optional.

## Required

| Variable                  | Purpose                                                       |
| ------------------------- | ------------------------------------------------------------- |
| `NODE_ENV`                | Must be `production`                                          |
| `BETTER_AUTH_URL`         | URL you open the app at (`http://localhost:8080` for a trial) |
| `AUTH_ORIGIN`             | Same value as `BETTER_AUTH_URL`                               |
| `APPLICATION_JWT_SECRET`  | Encryption key for stored credentials                         |
| `APP_SESSION_ID_SECRET`   | Signs request-tracing cookies                                 |
| `BETTER_AUTH_SECRET`      | Signs all auth sessions / tokens                              |
| `APPLICATION_DB_PASSWORD` | Postgres password (rest of `DB_*` default to `db`, etc.)      |
| `APPLICATION_DB_*`        | Host/port/user/db (defaults suit the bundled Postgres)        |
| `APPLICATION_REDIS_HOST`  | Redis hostname (defaults to `redis`)                          |
| `APPLICATION_PORT`        | Backend listen port; also the frontend proxy target (`8081`)  |

## Compose-level (optional, defaults shown)

| Variable                   | Purpose                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `HTTP_PORT` (`8080`)       | Host port the frontend is published on                                                                            |
| `IMAGE_TAG` (`latest`)     | Image tag to pull; set `sha-<commit>` to pin                                                                      |
| `DB_HOST_PORT` (`5432`)    | Postgres admin port; used only if you uncomment the db `ports:` line in `docker-compose.yml` (binds to localhost) |
| `REDIS_HOST_PORT` (`6379`) | Redis admin port; used only if you uncomment the redis `ports:` line in `docker-compose.yml` (binds to localhost) |

## Traefik overlay only

Ignored unless you use the [Traefik overlay](traefik-overlay.md)
(`docker-compose.traefik.yml`).

| Variable                                   | Purpose                                       |
| ------------------------------------------ | --------------------------------------------- |
| `SELFHOST_FRONTEND_DOMAIN`                 | Domain Traefik serves the app on              |
| `LETSENCRYPT_EMAIL`                        | Contact for ACME (Let's Encrypt) registration |
| `SELFHOST_API_DOMAIN`                      | Split-domain mode only: separate API host     |
| `TRAEFIK_HTTP_PORT` / `TRAEFIK_HTTPS_PORT` | Override Traefik's 80/443 host bindings       |

## Optional features (backend runtime; off until set)

| Variable                                                                       | Enables                                      |
| ------------------------------------------------------------------------------ | -------------------------------------------- |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`                                          | Email verification & notifications           |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`                                    | Google sign-in                               |
| `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET`                                    | GitHub sign-in                               |
| `ENABLE_BANKING_REDIRECT_URL`                                                  | Open-banking integrations                    |
| `POLYGON_API_KEY`, `ALPHA_VANTAGE_API_KEY`, `FMP_API_KEY`, `COINGECKO_API_KEY` | Investments / market data                    |
| `CRYPTO_PRICES_SYNC_INTERVAL_MINUTES`                                          | Crypto price sync cadence (1–59, default 15) |
| `API_LAYER_API_KEYS`                                                           | APILayer paid currency-rate fallback         |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` / `GROQ_API_KEY`     | AI transaction categorisation                |
| `LOGO_DEV_SECRET_KEY`                                                          | Server-side payee brand-logo search          |
| `ADMIN_USERS`                                                                  | Comma-separated admin usernames              |
| `AUTH_RP_ID`, `AUTH_RP_NAME`                                                   | WebAuthn / passkey support                   |
| `ALLOWED_ORIGINS`                                                              | Extra CORS origins beyond `AUTH_ORIGIN`      |
| `SENTRY_DSN`                                                                   | Backend error tracking                       |

## Frontend runtime (optional)

Interpolated into the frontend container's `environment:` block. Change and
`up -d` – **no image rebuild** needed.

| Variable                                                            | Purpose                                                              |
| ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`                             | Product analytics (PostHog)                                          |
| `VITE_SENTRY_DSN`, `VITE_SENTRY_RELEASE`                            | Frontend error tracking (Sentry)                                     |
| `VITE_LOGO_DEV_TOKEN`                                               | Brand logos for subs, banks, tickers (logo.dev)                      |
| `MCP_BASE_URL`                                                      | MCP base URL advertised to clients (default same-origin)             |
| `API_HTTP`, `API_VER`                                               | Point the SPA at a separate API origin (leave unset for same-origin) |
| `CSP_EXTRA_CONNECT`, `CSP_EXTRA_FORM_ACTION`, `CSP_EXTRA_ANALYTICS` | Extra CSP allow-list hosts (auto-derived if unset)                   |

## Build-from-source only

Used with `docker-compose.build.yml` (`--build`).

| Variable                                            | Purpose                                |
| --------------------------------------------------- | -------------------------------------- |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Sentry source-map upload at build time |

---

Setup guide: [setup-guide.md](setup-guide.md) · Troubleshooting:
[troubleshooting.md](troubleshooting.md)
