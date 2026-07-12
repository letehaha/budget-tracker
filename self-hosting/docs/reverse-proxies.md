# Reverse Proxies

The stack publishes the whole app on one HTTP port (`${HTTP_PORT:-8080}`,
i.e. `http://<host>:8080` by default), so any reverse proxy can sit in front
of it and terminate TLS. Point the proxy at that port; the app and the API
share the origin, so one proxy host covers everything.

## Requirements (any proxy)

- **Forward WebSocket / SSE upgrades.** The backend streams Server-Sent Events
  through the frontend's `/api` proxy; a proxy that buffers or drops upgrades
  will stall live updates.
- **Set `X-Forwarded-Proto`** (and forward the `Host` header) so the app builds
  correct absolute URLs and cookies behave over HTTPS.

On the app side, `BETTER_AUTH_URL` and `AUTH_ORIGIN` in `.env` must carry the
public origin the proxy serves – see
[setup-guide.md](setup-guide.md#3-behind-your-own-reverse-proxy).

## Nginx Proxy Manager

Add a **Proxy Host**: forward to `http://<host>:8080`, and enable
**Websockets Support** in the details tab. Request a Let's Encrypt cert on the
SSL tab. Nothing else to configure – the app and API share the origin.

## Caddy

```caddy
budget.example.com {
    reverse_proxy <host>:8080
}
```

Caddy forwards WebSocket upgrades and sets `X-Forwarded-*` headers by default,
and provisions TLS automatically.

No reverse proxy yet? The stack can terminate TLS itself – see
[traefik-overlay.md](traefik-overlay.md).
