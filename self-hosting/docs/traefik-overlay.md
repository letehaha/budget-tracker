# Bundled Traefik + Let's Encrypt Overlay

Use this overlay only if you do **not** already run a reverse proxy. It adds a
Traefik container that terminates TLS with automatic Let's Encrypt certificates
and routes to the frontend over the internal network (the base file's host port
is dropped via `!reset`, so nothing else needs port 80/443).

Requirements:

- **Compose v2.24+** (for the `!reset` merge tag).
- A DNS **A record** for your domain pointing at the host's public IP, and
  ports **80 + 443 reachable** from the internet (Let's Encrypt requirement).
- No domain? [**nip.io**](https://nip.io) turns any IP into a real hostname
  with no signup – e.g. `budget.203-0-113-42.nip.io` resolves to
  `203.0.113.42`, and Let's Encrypt issues genuine certs for it.

Set the Traefik-only variables in `.env`:

```bash
SELFHOST_FRONTEND_DOMAIN=budget.example.com
LETSENCRYPT_EMAIL=you@example.com
```

Start with both files (compose merges left-to-right):

```bash
docker compose -f docker-compose.yml \
  -f docker-compose.traefik.yml up -d
```

Traefik requests the certificate on the first HTTPS hit to your domain; that
first request can take 10–30 seconds while ACME runs. Then open
`https://budget.example.com`.

> **Advanced – split-domain mode.** By default the API is served same-origin
> through the frontend's `/api` proxy, so the backend needs no domain of its
> own. To instead serve the API on a separate `SELFHOST_API_DOMAIN`, uncomment
> the `backend` labels block in `docker-compose.traefik.yml`, set
> `SELFHOST_API_DOMAIN`, and set `API_HTTP=https://<api domain>` so the SPA
> targets it directly. Most self-hosters do not need this.

---

Setup guide: [setup-guide.md](setup-guide.md) · Traefik-only variables:
[environment-reference.md](environment-reference.md#traefik-overlay-only)
