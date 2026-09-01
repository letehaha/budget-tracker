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

| Variable                   | Purpose                                                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HTTP_PORT` (`8080`)       | Host port the app is served on; set `127.0.0.1:8080` to make it reachable only from the server itself (when a reverse proxy on the same server fronts the app) |
| `IMAGE_TAG` (`latest`)     | Image tag to pull; set `sha-<commit>` to pin                                                                                                                   |
| `DB_HOST_PORT` (`5432`)    | Postgres admin port; used only if you uncomment the db `ports:` line in `docker-compose.yml` (binds to localhost)                                              |
| `REDIS_HOST_PORT` (`6379`) | Redis admin port; used only if you uncomment the redis `ports:` line in `docker-compose.yml` (binds to localhost)                                              |

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

| Variable                                                                                          | Enables                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`                                                             | All outbound email: address verification, share invitations, membership notices. Unset means invitations are created but never delivered – the link must be shared manually |
| `APP_URL`                                                                                         | Public URL of your frontend, used as the base for links inside invitation / notification emails (defaults to `https://moneymatter.app`)                                     |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`                                                       | Google sign-in                                                                                                                                                              |
| `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET`                                                       | GitHub sign-in                                                                                                                                                              |
| `ENABLE_BANKING_REDIRECT_URL`                                                                     | Open-banking integrations                                                                                                                                                   |
| `POLYGON_API_KEY`, `ALPHA_VANTAGE_API_KEY`, `FMP_API_KEY`, `COINGECKO_API_KEY`                    | Investments / market data                                                                                                                                                   |
| `CRYPTO_PRICES_SYNC_INTERVAL_MINUTES`                                                             | Crypto price sync cadence (1–59, default 15)                                                                                                                                |
| `API_LAYER_API_KEYS`                                                                              | APILayer paid currency-rate fallback                                                                                                                                        |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` / `GROQ_API_KEY` / `OPENROUTER_API_KEY` | AI transaction categorisation                                                                                                                                               |
| `LOGO_DEV_SECRET_KEY`                                                                             | Server-side payee brand-logo search. Search results only – rendering the logo images also needs `VITE_LOGO_DEV_TOKEN` (below)                                               |
| `ADMIN_USERS`                                                                                     | Comma-separated admin usernames                                                                                                                                             |
| `AUTH_RP_ID`, `AUTH_RP_NAME`                                                                      | WebAuthn / passkey support. `AUTH_RP_NAME` doubles as the brand and sender name on outbound emails                                                                          |
| `ALLOWED_ORIGINS`                                                                                 | Extra CORS origins beyond `AUTH_ORIGIN`                                                                                                                                     |
| `SENTRY_DSN`                                                                                      | Backend error tracking                                                                                                                                                      |
| `SYSTEM_MAX_SIGNUPS_ALLOWED`                                                                      | Cap on user accounts: signups are rejected once the instance has this many users (`0` disables signups, `1` = "just me"). Deleting a user frees a slot. Unset = unlimited   |
| `SYSTEM_DEMO_DISABLED`                                                                            | Blocks demo-account creation (`POST /demo`). Defaults to `true` in the self-host compose stack; set to `false` to allow demo accounts                                       |

## Frontend runtime (optional)

Interpolated into the frontend container's `environment:` block. Change and
`up -d` – **no image rebuild** needed.

| Variable                                     | Purpose                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`      | Product analytics (PostHog)                                             |
| `VITE_SENTRY_DSN`                            | Frontend error tracking (Sentry)                                        |
| `VITE_SENTRY_RELEASE`                        | Release tag Sentry events report — also a build arg, see below          |
| `VITE_LOGO_DEV_TOKEN`                        | Brand logos for payees, subs, banks, tickers (logo.dev publishable key) |
| `MCP_BASE_URL`                               | Backend origin advertised to MCP clients — required for MCP, see below  |
| `API_HTTP`, `API_VER`                        | Point the SPA at a separate API origin (leave unset for same-origin)    |
| `CSP_EXTRA_CONNECT`, `CSP_EXTRA_FORM_ACTION` | Extra CSP allow-list hosts (default to `API_HTTP`)                      |
| `CSP_EXTRA_ANALYTICS`                        | CSP allow-list for analytics — **set this if you use Sentry**           |

`CSP_EXTRA_ANALYTICS` defaults to `VITE_POSTHOG_HOST` only. Sentry's ingest host
is not derivable from the DSN by the entrypoint, so a Sentry deployment that
leaves this unset gets a `connect-src` that blocks every error report.

`MCP_BASE_URL` is the URL the app advertises to external MCP clients (Claude
Desktop, ChatGPT). In same-origin mode set it to the origin you reach the app on
(`https://money.example.com`): the frontend container proxies `/mcp` and the
OAuth discovery endpoints to the backend, and the backend builds its discovery
documents from this value, so clients are pointed at your instance rather than
the hosted one. In split-domain mode set it to the backend's own origin. Leave
it unset if you do not use MCP.

Whatever fronts the frontend container must pass these paths through to it
unchanged, alongside `/api/`: `/mcp`, `/.well-known/oauth-authorization-server`,
`/.well-known/oauth-protected-resource` (both also in their `/mcp`-suffixed
form), and `/authorize`, `/token`, `/register`. A proxy that forwards only `/`
and `/api/` already covers them; one with an explicit path allow-list does not.

The `VITE_` prefix on the frontend keys above is historical: these are read from
the container's env at start, not inlined at build time. `docker-compose.yml`
maps them onto the unprefixed names the image expects (`VITE_POSTHOG_KEY` →
`POSTHOG_KEY`, and so on).

## Build-from-source only

Used with `docker-compose.build.yml` (`--build`).

| Variable                                            | Purpose                                                         |
| --------------------------------------------------- | --------------------------------------------------------------- |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Sentry source-map upload at build time                          |
| `VITE_SENTRY_RELEASE`                               | Names the uploaded source maps; baked in as the release default |

`VITE_SENTRY_RELEASE` is the one value that is both a build arg and runtime env.
The build stamps it into the image as the release the SDK reports by default, so
that events match the source maps uploaded alongside them. Setting it in `.env`
after an image already exists only changes the runtime value — rebuild
(`--build`) to move the source maps with it.

## Set for you

`IS_SELF_HOST` is written straight into `docker-compose.yml`, on both the
backend and the frontend. There is nothing to put in `.env` — anything you set
there is ignored. It marks the stack as yours rather than the hosted service,
which turns on two things:

- **A custom AI endpoint can point at a server on your own network.** On the
  hosted service the app refuses private addresses (`localhost`, `192.168.x.x`,
  and so on), because there they could only be someone probing the server it
  runs on. On your own stack that restriction is lifted, so you can use a model
  running on your machine or elsewhere on your LAN.
- **Restoring a backup fills in price history.** After a restore, your stocks
  and crypto get their past prices fetched again, so charts and past valuations
  look right instead of starting from the restore date.

---

Setup guide: [setup-guide.md](setup-guide.md) · Troubleshooting:
[troubleshooting.md](troubleshooting.md)
